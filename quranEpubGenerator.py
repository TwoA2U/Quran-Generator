import argparse
import json
import os
import time

import pycountry as _pycountry
import requests
from dotenv import load_dotenv

baseUrl = "https://apis.quran.foundation"
load_dotenv()

QURAN_SCRIPT = [
    "uthmani",
    "uthmani_simple",
    "text_uthmani_simple",
    "uthmani_tajweed",
    "text_uthmani_tajweed",
    "indopak",
    "text_indopak",
    "indopak_nastaleeq",
    "text_indopak_nastaleeq",
    "imlaei",
    "text_imlaei",
    "imlaei_simple",
    "text_imlaei_simple",
    "qpc_hafs",
    "text_qpc_hafs",
    "qpc_nastaleeq",
    "text_qpc_nastaleeq",
    "code_v1",
    "v1",
    "code_v2",
    "v2",
]

# ── ISO 639-1 lookup via pycountry ───────────────────────────────────────────
# The API returns full language names (e.g. "english", "indonesian").
# pycountry resolves most names → ISO 639-1 alpha_2 codes automatically.
# The override dict handles the few cases where the API name differs from
# pycountry's canonical name (e.g. "farsi" vs "Persian").


_LANG_NAME_OVERRIDES = {
    "farsi": "fa",  # pycountry uses "Persian"
    "pashto": "ps",  # pycountry uses "Pushto"
    "sinhalese": "si",  # pycountry uses "Sinhala"
    "uyghur": "ug",  # pycountry uses "Uighur"
}


def _resolveIso(language_name: str) -> str:
    """Resolve an API language name to its ISO 639-1 alpha_2 code."""
    name = language_name.lower().strip()
    if name in _LANG_NAME_OVERRIDES:
        return _LANG_NAME_OVERRIDES[name]
    lang = _pycountry.languages.get(name=name.capitalize())
    if lang:
        return getattr(lang, "alpha_2", name)  # fallback to raw name if no alpha_2
    return name  # unknown language — return as-is so --list-langs still shows it


# ── Global token state ────────────────────────────────────────────────────────

_token_state = {
    "access_token": None,
    "client_id": None,
    "client_secret": None,
}


def getToken(CLIENT_ID, CLIENT_SECRET):
    """Fetch a new access token and update the global token state."""
    response = requests.post(
        "https://oauth2.quran.foundation/oauth2/token",
        auth=(CLIENT_ID, CLIENT_SECRET),
        data={"grant_type": "client_credentials", "scope": "content"},
    )
    response.raise_for_status()
    data = response.json()
    _token_state["access_token"] = data["access_token"]
    _token_state["client_id"] = CLIENT_ID
    _token_state["client_secret"] = CLIENT_SECRET
    return data


def _refreshToken():
    """Re-request a token using the stored credentials."""
    print("[auth] Token expired — refreshing...")
    getToken(_token_state["client_id"], _token_state["client_secret"])
    print("[auth] Token refreshed.")


# ── Safe request wrapper ──────────────────────────────────────────────────────


def safeGet(url, headers_extra=None, max_retries=5):
    """
    GET with error handling:
      401 → refresh token and retry once
      403 → abort immediately (bad credentials / no access)
      429 → exponential backoff, up to max_retries
    """
    headers_extra = headers_extra or {}
    retries = 0

    while True:
        headers = {**headers_extra}
        if _token_state["access_token"]:
            headers["x-auth-token"] = _token_state["access_token"]
            headers["x-client-id"] = _token_state["client_id"]

        response = requests.get(url, headers=headers)

        if response.status_code == 200:
            return response

        elif response.status_code == 401:
            if retries >= 1:
                raise RuntimeError(
                    f"[401] Token refresh failed — still unauthorized after retry.\n"
                    f"URL: {url}"
                )
            print("[401] Unauthorized — attempting token refresh.")
            _refreshToken()
            retries += 1
            continue

        elif response.status_code == 403:
            raise RuntimeError(
                f"[403] Access denied — check your CLIENT_ID and CLIENT_SECRET.\n"
                f"URL: {url}"
            )

        elif response.status_code == 429:
            if retries >= max_retries:
                raise RuntimeError(
                    f"[429] Rate limit exceeded — gave up after {max_retries} retries.\n"
                    f"URL: {url}"
                )
            retry_after = response.headers.get("Retry-After")
            wait = int(retry_after) if retry_after else (2**retries)
            print(
                f"[429] Rate limited — waiting {wait}s (retry {retries + 1}/{max_retries})..."
            )
            time.sleep(wait)
            retries += 1
            continue

        else:
            raise RuntimeError(
                f"[{response.status_code}] Unexpected error.\n"
                f"URL: {url}\n"
                f"Body: {response.text[:200]}"
            )


# ── API functions ─────────────────────────────────────────────────────────────


def getTranslationList():
    """
    Returns list of dicts: {id, name, language_name, iso}
    iso is resolved from LANG_NAME_TO_ISO; falls back to the raw language_name.
    """
    response = safeGet(
        "https://api.quran.com/api/v4/resources/translations",
        headers_extra={},
    )
    result = []
    for i in response.json().get("translations", []):
        lang_name = i.get("language_name", "").lower()
        iso = _resolveIso(lang_name)
        result.append(
            {
                "id": i.get("id", 0),
                "name": f"{lang_name}-{i.get('name', '')}",
                "language_name": lang_name,
                "iso": iso,
            }
        )
    return result


def getTranslation(languageId):
    translationCleaned = {}

    for surah in range(1, 115):
        translationCleaned[surah] = []

        response = safeGet(
            baseUrl
            + f"/content/api/v4/translations/{languageId}/by_chapter/{surah}"
            + "?page=1&per_page=50&fields=chapter_id,verse_number,page_number",
            headers_extra={},
        )
        data = response.json()

        for i in data.get("translations", []):
            translationCleaned[surah].append(
                {
                    "surah_id": i.get("chapter_id"),
                    "ayah_id": i.get("verse_number"),
                    "page_id": i.get("page_number"),
                    "text": i.get("text"),
                }
            )

        totalPages = data.get("pagination", {}).get("total_pages", 1)
        for page in range(2, totalPages + 1):
            response = safeGet(
                baseUrl
                + f"/content/api/v4/translations/{languageId}/by_chapter/{surah}"
                + f"?page={page}&per_page=50&fields=chapter_id,verse_number,page_number",
                headers_extra={},
            )
            for i in response.json().get("translations", []):
                translationCleaned[surah].append(
                    {
                        "surah_id": i.get("chapter_id"),
                        "ayah_id": i.get("verse_number"),
                        "page_id": i.get("page_number"),
                        "text": i.get("text"),
                    }
                )

    return translationCleaned


def getScript(script="uthmani"):
    qurancleaned = []
    response = safeGet(
        baseUrl + f"/content/api/v4/quran/verses/{script}",
        headers_extra={},
    )
    for i in response.json().get("verses", []):
        surah = i.get("verse_key").split(":")[0]
        ayah = i.get("verse_key").split(":")[1]

        if script not in ("code_v1", "code_v2", "v1", "v2"):
            cleanscript = script if script.startswith("text_") else f"text_{script}"
        else:
            cleanscript = script if script.startswith("code_") else f"code_{script}"

        qurancleaned.append(
            {"surahId": surah, "ayahId": ayah, "script": i.get(cleanscript)}
        )
    return qurancleaned


def generateTranslationManifest(
    translation_dir="public/translation", out_path="public/data/translations.json"
):
    """
    Scans public/translation/ and writes public/data/translations.json.
    Each entry: { "file": "english-Sahih International", "iso": "en", "language": "English", "name": "Sahih International" }
    The filename format is always "<language_name>-<translator_name>", so split on the
    first "-" to get both parts. JS can do the same: file.split("-") -> [language, name]
    """
    if not os.path.isdir(translation_dir):
        print(f"[manifest] Directory not found: {translation_dir}")
        return

    entries = []
    for filename in sorted(os.listdir(translation_dir)):
        if not filename.endswith(".json"):
            continue
        stem = filename[:-5]  # strip .json

        # Split on first "-" only — translator names may contain dashes
        parts = stem.split("-", 1)
        lang_raw = parts[0].strip()
        translator = parts[1].strip() if len(parts) > 1 else ""

        iso = _resolveIso(lang_raw)

        # Get the canonical language name from pycountry if possible
        lang_obj = _pycountry.languages.get(alpha_2=iso)
        language = lang_obj.name if lang_obj else lang_raw.capitalize()

        entries.append(
            {
                "file": stem,
                "iso": iso,
                "language": language,
                "name": translator,
            }
        )

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)

    print(f"[manifest] Written {len(entries)} entries → {out_path}")


# ── Entry point ───────────────────────────────────────────────────────────────


def main():
    CLIENT_ID = os.getenv("QF_CLIENT_ID")
    CLIENT_SECRET = os.getenv("QF_CLIENT_SECRET")

    parser = argparse.ArgumentParser(
        description="Quran data fetcher — downloads Arabic scripts and/or translations.",
        formatter_class=argparse.RawTextHelpFormatter,
    )
    parser.add_argument(
        "--client-id", type=str, help="Quran API Client ID", required=False
    )
    parser.add_argument(
        "--client-secret", type=str, help="Quran API Client Secret", required=False
    )
    parser.add_argument(
        "--mode",
        type=str,
        choices=["both", "translation", "script"],
        default="translation",
        help=(
            "What to download (default: translation):\n"
            "  both        — Arabic scripts + translations\n"
            "  translation — translations only\n"
            "  script      — Arabic scripts only"
        ),
    )
    parser.add_argument(
        "--lang",
        type=str,
        nargs="+",
        metavar="ISO",
        default=["en"],
        help=(
            "ISO 639-1 code(s) to filter translations, e.g. --lang en id az\n"
            "Default: en (English). Pass 'all' to download every language."
        ),
    )
    parser.add_argument(
        "--list-langs",
        action="store_true",
        help="Print all available language codes and their translations, then exit.",
    )
    parser.add_argument(
        "--gen-manifest",
        action="store_true",
        help="Scan public/translation/ and write public/data/translations.json, then exit.",
    )
    args = parser.parse_args()

    if args.client_id is not None:
        CLIENT_ID = args.client_id
    if args.client_secret is not None:
        CLIENT_SECRET = args.client_secret

    # ── --gen-manifest ───────────────────────────────────────────────────────
    if args.gen_manifest:
        generateTranslationManifest()
        return

    getToken(CLIENT_ID, CLIENT_SECRET)
    print("[auth] Token acquired.")

    # ── --list-langs ─────────────────────────────────────────────────────────
    if args.list_langs:
        translationList = getTranslationList()
        seen_isos = sorted({e["iso"] for e in translationList})
        print(f"\nAvailable languages ({len(seen_isos)}):\n")
        for iso in seen_isos:
            entries = [e for e in translationList if e["iso"] == iso]
            lang_name = entries[0]["language_name"].capitalize()
            print(f"  {iso:6s}  {lang_name}")
            for e in entries:
                print(f"           [{e['id']:>4}] {e['name']}")
        return

    os.makedirs("public/script", exist_ok=True)
    os.makedirs("public/translation", exist_ok=True)

    # ── Script mode ───────────────────────────────────────────────────────────
    if args.mode in ("script", "both"):
        print(f"\nDownloading all {len(QURAN_SCRIPT)} scripts")
        print("----------------------------------------------------")
        for script in QURAN_SCRIPT:
            print(f"  Fetching script: {script}")
            try:
                quran = getScript(script)
                with open(f"public/script/{script}.json", "w", encoding="utf-8") as f:
                    json.dump(quran, f, ensure_ascii=False, indent=2)
                print(f"  ✓ Saved public/script/{script}.json")
            except RuntimeError as e:
                print(f"  [skip] {script} — {e}")

    # ── Translation mode ──────────────────────────────────────────────────────
    if args.mode in ("translation", "both"):
        translationList = getTranslationList()

        # "all" bypasses language filter
        if args.lang == ["all"]:
            filtered = translationList
        else:
            requested = {code.lower() for code in args.lang}
            filtered = [e for e in translationList if e["iso"] in requested]
            missing = requested - {e["iso"] for e in filtered}
            if missing:
                print(
                    f"[warn] No translations found for ISO code(s): {', '.join(sorted(missing))}"
                )
                print(f"       Run --list-langs to see all available codes.")

        if not filtered:
            print("[warn] No matching translations to download.")
        else:
            print(f"\nDownloading {len(filtered)} translation(s)")
            print("----------------------------------------------------")
            for entry in filtered:
                print(f"  Fetching: {entry['name']}")
                try:
                    translated = getTranslation(entry["id"])
                    out_path = f"public/translation/{entry['name']}.json"
                    with open(out_path, "w", encoding="utf-8") as f:
                        json.dump(translated, f, ensure_ascii=False, indent=2)
                    print(f"  ✓ Saved {out_path}")
                except RuntimeError as e:
                    print(f"  [skip] {entry['name']} — {e}")

    # Auto-regenerate manifest after any translation download
    if args.mode in ("translation", "both"):
        generateTranslationManifest()

    print("\nDone.")


if __name__ == "__main__":
    main()

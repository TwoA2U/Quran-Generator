import argparse
import json
from ast import TryStar
from gettext import translation
from tracemalloc import start

import requests

baseUrl = "https://apis.quran.foundation"
CLIENT_ID = ""
CLIENT_SECRET = ""


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
]


def getToken(CLIENT_ID, CLIENT_SECRET):
    response = requests.post(
        "https://oauth2.quran.foundation/oauth2/token",
        auth=(CLIENT_ID, CLIENT_SECRET),
        data={"grant_type": "client_credentials", "scope": "content"},
    )

    return response.json()


def getTranslation():
    response = requests.get(f"{baseUrl}/resources/translations")

    translationCleaned = []
    for i in response.json().get("translation", []):
        translationCleaned.append(
            {
                "id": i.get("id", 0),
                "name": f"{i.get('language_name', '')}-{i.get('name', '')}",
            }
        )
    return translationCleaned


def getQuran(ACCESS_TOKEN, script="uthmani", languageId=20):
    responseScript = requests.get(
        baseUrl + f"/content/api/v4/quran/verses/{script}",
        headers={"x-auth-token": ACCESS_TOKEN, "x-client-id": CLIENT_ID},
    )

    translationCleaned = {}

    for surah in list(range(1, 115)):
        translationCleaned[surah] = []
        responseTranslation = requests.get(
            baseUrl
            + f"/content/api/v4/translations/{languageId}/by_chapter/{surah}?page=1&per_page=50&fields=chapter_id,verse_number",
            headers={"x-auth-token": ACCESS_TOKEN, "x-client-id": CLIENT_ID},
        )
        for i in responseTranslation.json().get("translations", []):
            translationCleaned[surah].append(
                {
                    "surah_id": i.get("chapter_id"),
                    "ayah_id": i.get("verse_number"),
                    "text": i.get("text"),
                }
            )

        totalPages = (
            responseTranslation.json().get("pagination", {}).get("total_pages", 1)
        )
        if totalPages > 1:
            for page in list(range(2, totalPages + 1)):
                responseTranslation = requests.get(
                    baseUrl
                    + f"/content/api/v4/translations/{languageId}/by_chapter/{surah}?page={page}&per_page=50&fields=chapter_id,verse_number",
                    headers={"x-auth-token": ACCESS_TOKEN, "x-client-id": CLIENT_ID},
                )
                for i in responseTranslation.json().get("translations", []):
                    translationCleaned[surah].append(
                        {  # appends into the same surah bucket
                            "surah_id": i.get("chapter_id"),
                            "ayah_id": i.get("verse_number"),
                            "text": i.get("text"),
                        }
                    )

    qurancleaned = []
    for i in responseScript.json().get("verses", []):
        surah = i.get("verse_key").split(":")[0]
        ayah = i.get("verse_key").split(":")[1]

        # find the matching translation for this specific ayah
        surah_translations = translationCleaned.get(int(surah), [])
        ayah_translation = next(
            (t for t in surah_translations if str(t.get("ayah_id")) == ayah), None
        )

        qurancleaned.append(
            {
                "surahId": surah,
                "ayahId": ayah,
                "script": i.get(f"text_{script}"),
                "translation": ayah_translation.get("text")
                if ayah_translation
                else None,
            }
        )
    return qurancleaned


def main():
    global CLIENT_ID, CLIENT_SECRET, ACCESS_TOKEN, QURAN_SCRIPT
    parser = argparse.ArgumentParser(description="Quran EPUB Generator")
    parser.add_argument(
        "--client-id", type=str, help="Quran API Client ID", required=False
    )
    parser.add_argument(
        "--client-secret", type=str, help="Quran API Client Secret", required=False
    )
    args = parser.parse_args()

    if args.client_id is not None:
        CLIENT_ID = args.client_id
    if args.client_secret is not None:
        CLIENT_SECRET = args.client_secret

    ACCESS_TOKEN = getToken(CLIENT_ID, CLIENT_SECRET)["access_token"]

    # choosenScript = input("Enter the script you want to use (e.g. uthmani): ")
    for i in QURAN_SCRIPT:
        quran = getQuran(ACCESS_TOKEN, i)
        with open("quran.json", "w", encoding="utf-8") as f:
            json.dump(quran, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()

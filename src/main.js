/**
 * Al-Quran EPUB Generator - Browser-side
 * Browser flow: fetch AlQuran.cloud API -> generate EPUB -> download
 */

import epub from "epub-gen-memory/bundle";
const btnGenerate = document.getElementById("btn-generate");
const optPage = document.getElementById("opt-page");
const optFont = document.getElementById("opt-font");
const optFilename = document.getElementById("opt-filename");
const apiKeyInput = document.getElementById("api-key");
const editionArabicInput = document.getElementById("edition-arabic");
const editionLatinInput = document.getElementById("edition-latin");
const editionTranslationInput = document.getElementById("edition-translation");
const progressCard = document.getElementById("section-progress");
const progressBar = document.getElementById("progress-bar");
const progressPct = document.getElementById("progress-pct");
const progressTitle = document.getElementById("progress-title");
const progressDetail = document.getElementById("progress-detail");

async function loadSurahList() {
  try {
    const res = await fetch("./data/surah.json");
    if (!res.ok)
      throw new Error(`Local surah metadata not found (${res.status})`);
    return await res.json();
  } catch (err) {
    console.warn("Metadata lokal gagal dimuat, pakai metadata API:", err);
    const apiSurahs = await fetchJson(buildApiUrl("surah", ""));
    return apiSurahs.map((surah) => ({
      surah_id: surah.number,
      surah_name: surah.englishName,
      surah_name_arabic: surah.name,
      surah_name_bahasa: surah.englishNameTranslation,
      surah_verse_count: surah.numberOfAyahs,
    }));
  }
}

function setProgress(pct, title, detail = "") {
  progressCard.style.display = "block";
  progressBar.style.width = pct + "%";
  progressPct.textContent = Math.round(pct) + "%";
  progressTitle.textContent = title;
  progressDetail.textContent = detail;
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripHtml(value = "") {
  const doc = new DOMParser().parseFromString(String(value), "text/html");
  return doc.body.textContent || "";
}

function buildApiUrl(path, apiKey) {
  const url = new URL(`https://api.alquran.cloud/v1/${path}`);
  if (apiKey) url.searchParams.set("apikey", apiKey);
  return url.toString();
}

function renderEditionOptions(
  selectEl,
  editions,
  defaultIdentifier,
  emptyLabel = "",
) {
  selectEl.innerHTML = "";
  if (emptyLabel) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = emptyLabel;
    selectEl.appendChild(option);
  }
  editions.forEach((edition) => {
    const option = document.createElement("option");
    option.value = edition.identifier;
    option.textContent = `${edition.identifier} - ${edition.name}${edition.englishName && edition.englishName !== "Unknown" ? ` (${edition.englishName})` : ""}`;
    selectEl.appendChild(option);
  });
  selectEl.value = editions.some(
    (edition) => edition.identifier === defaultIdentifier,
  )
    ? defaultIdentifier
    : emptyLabel
      ? ""
      : editions[0]?.identifier || "";
}

async function loadEditionOptions() {
  try {
    const editions = await fetchJson(buildApiUrl("edition?format=text", ""));
    const arabicEditions = editions.filter(
      (edition) => edition.language === "ar" && edition.type === "quran",
    );
    const latinEditions = editions.filter(
      (edition) =>
        edition.type === "transliteration" ||
        edition.identifier.toLowerCase().includes("transliteration"),
    );
    const translationEditions = editions
      .filter((edition) => edition.type === "translation")
      .sort((a, b) =>
        `${a.language}.${a.name}`.localeCompare(`${b.language}.${b.name}`),
      );

    if (arabicEditions.length) {
      renderEditionOptions(editionArabicInput, arabicEditions, "quran-uthmani");
    }
    if (latinEditions.length) {
      renderEditionOptions(
        editionLatinInput,
        latinEditions,
        "en.transliteration",
      );
    }
    if (translationEditions.length) {
      renderEditionOptions(
        editionTranslationInput,
        translationEditions,
        "id.indonesian",
        "Tanpa terjemahan",
      );
    }
  } catch (err) {
    console.warn("Daftar edisi gagal dimuat, pakai opsi bawaan:", err);
  }
}

async function fetchJson(url) {
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`API gagal (${res.status}) saat memuat ${url}`);

  const json = await res.json();
  if (json.code && json.code !== 200) {
    throw new Error(json.status || `API gagal (${json.code})`);
  }
  return json.data;
}

async function fetchSurahFromApi(num, opts) {
  const editionIds = [
    opts.editionArabic,
    opts.editionLatin,
    opts.editionTranslation,
  ].filter(Boolean);
  const editions = editionIds
    .map((edition) => encodeURIComponent(edition))
    .join(",");
  const data = await fetchJson(
    buildApiUrl(`surah/${num}/editions/${editions}`, opts.apiKey),
  );
  const editionList = Array.isArray(data) ? data : [];
  const arabicEdition =
    editionList.find(
      (item) => item.edition?.identifier === opts.editionArabic,
    ) || editionList[0];
  const latinEdition =
    editionList.find(
      (item) => item.edition?.identifier === opts.editionLatin,
    ) || editionList[1];
  const translationEdition = opts.editionTranslation
    ? editionList.find(
        (item) => item.edition?.identifier === opts.editionTranslation,
      )
    : null;

  if (!arabicEdition?.ayahs?.length) {
    throw new Error(
      `Data Arab surah ${num} kosong. Cek edisi "${opts.editionArabic}".`,
    );
  }

  const latinByAyah = new Map(
    (latinEdition?.ayahs || []).map((ayah) => [ayah.numberInSurah, ayah]),
  );
  const translationByAyah = new Map(
    (translationEdition?.ayahs || []).map((ayah) => [ayah.numberInSurah, ayah]),
  );

  return arabicEdition.ayahs.map((ayah) => {
    const latin = latinByAyah.get(ayah.numberInSurah);
    const translation = translationByAyah.get(ayah.numberInSurah);
    return {
      ayah_number: ayah.numberInSurah,
      page_number: ayah.page,
      script: ayah.text,
      latin: stripHtml(latin?.text || ""),
      translation: stripHtml(translation?.text || ""),
    };
  });
}

async function fetchQuranEdition(edition, apiKey) {
  if (!edition) return null;
  const data = await fetchJson(
    buildApiUrl(`quran/${encodeURIComponent(edition)}`, apiKey),
  );
  if (!data?.surahs?.length) {
    throw new Error(`Data edisi "${edition}" kosong.`);
  }
  return data;
}

function indexSurahsByNumber(quranData) {
  return new Map(
    (quranData?.surahs || []).map((surah) => [surah.number, surah]),
  );
}

function mergeQuranEditions(arabicData, latinData, translationData) {
  const latinBySurah = indexSurahsByNumber(latinData);
  const translationBySurah = indexSurahsByNumber(translationData);
  const verseDataMap = {};

  arabicData.surahs.forEach((arabicSurah) => {
    const latinByAyah = new Map(
      (latinBySurah.get(arabicSurah.number)?.ayahs || []).map((ayah) => [
        ayah.numberInSurah,
        ayah,
      ]),
    );
    const translationByAyah = new Map(
      (translationBySurah.get(arabicSurah.number)?.ayahs || []).map((ayah) => [
        ayah.numberInSurah,
        ayah,
      ]),
    );

    verseDataMap[arabicSurah.number] = arabicSurah.ayahs.map((ayah) => {
      const latin = latinByAyah.get(ayah.numberInSurah);
      const translation = translationByAyah.get(ayah.numberInSurah);
      return {
        ayah_number: ayah.numberInSurah,
        page_number: ayah.page,
        script: ayah.text,
        latin: stripHtml(latin?.text || ""),
        translation: stripHtml(translation?.text || ""),
      };
    });
  });

  return verseDataMap;
}

function buildEpubCss(fontBase64, fontFamilyName = "Arabic Font") {
  const fontFace = fontBase64
    ? `@font-face {
    font-family: "${fontFamilyName}";
    font-weight: 400;
    font-style: normal;
    src: url("data:font/woff2;base64,${fontBase64}") format("woff2");
  }`
    : "";

  return `
    ${fontFace}
    body { font-family: serif; margin: 1em; padding: 0; }
    .surah-header { text-align: center; margin-bottom: 1.2em; padding: 0.6em 0;
      border-top: 1px solid #000; border-bottom: 1px solid #000; }
    .surah-number { font-size: 0.85em; font-weight: bold; display: block; margin-bottom: 0.3em; }
    .surah-name-arabic { font-family: "${fontFamilyName}", "Scheherazade New", "Traditional Arabic", serif;
      font-size: 2em; direction: rtl; display: block; margin: 0.2em 0; }
    .surah-name-latin { font-size: 1.05em; font-weight: bold; display: block; }
    .surah-meta { font-size: 0.8em; display: block; margin-top: 0.3em; }
    .basmalah { font-family: "${fontFamilyName}", "Scheherazade New", "Traditional Arabic", serif;
      font-size: 1.35em; line-height: 1.8; direction: rtl; text-align: center; margin: 1em 0; }
    .ayah-block { margin-bottom: 1.2em; padding-bottom: 0.8em; border-bottom: 1px solid #ccc; }
    .ayah-block:last-child { border-bottom: none; }
    .ayah-meta { font-size: 0.78em; line-height: 1; font-weight: bold; margin-bottom: 0.35em; }
    .arabic-text { font-family: "${fontFamilyName}", "Scheherazade New", "Traditional Arabic", serif;
      font-size: 1.7em; line-height: 1.2; direction: rtl; text-align: right; display: block; margin-bottom: 0.35em; }
    .latin-line { font-size: 0.85em; line-height: 1.2; }
    .translation-line { font-size: 0.85em; line-height: 1.2; margin-top: 0.25em; }
  `;
}

function buildSurahHtml(surahMeta, verses, opts) {
  const { num, name, nameAr, nameBahasa, revType, verseCount } = surahMeta;
  const basmalahText = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ";
  const basmalahHtml =
    num !== 1 && num !== 9 ? `<p class="basmalah">${basmalahText}</p>` : "";

  const blocks = verses
    .map((v) => {
      const pageText =
        opts.showPage && v.page_number ? ` - Hal. ${v.page_number}` : "";
      const script =
        num !== 1 && num !== 9 && v.ayah_number === 1
          ? v.script.replace(
              /^﻿?بِسْمِ\s+ٱللَّهِ\s+ٱلرَّحْمَٰنِ\s+ٱلرَّحِيمِ\s*/u,
              "",
            )
          : v.script;
      const translationHtml =
        opts.editionTranslation && v.translation
          ? `<p class="translation-line">${escapeHtml(v.translation)}</p>`
          : "";

      return `
      <div class="ayah-block">
        <p class="ayah-meta">Ayat ${v.ayah_number}${pageText}</p>
        <p class="arabic-text">${escapeHtml(script)}</p>
        <p class="latin-line">${escapeHtml(v.latin)}</p>
        ${translationHtml}
      </div>`;
    })
    .join("\n");

  return `
    <div class="surah-header">
      <p class="surah-number">Surah ${num}</p>
      <p class="surah-name-arabic">${escapeHtml(nameAr)}</p>
      <p class="surah-name-latin">${escapeHtml(name)} - ${escapeHtml(nameBahasa)}</p>
      <p class="surah-meta">${revType} - ${verseCount} Ayat</p>
    </div>
    ${basmalahHtml}
    ${blocks}
  `;
}

const MAKKIYAH = new Set([
  1, 6, 7, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 23, 25, 26, 27, 28,
  29, 30, 31, 32, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 50, 51,
  52, 53, 54, 55, 56, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80,
  81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 100, 101,
  102, 103, 104, 105, 106, 107, 108, 109, 111, 112, 113, 114,
]);

async function generate() {
  btnGenerate.disabled = true;
  btnGenerate.classList.add("loading");
  progressCard.style.display = "block";

  const opts = {
    showPage: optPage.checked,
    apiKey: apiKeyInput.value.trim(),
    editionArabic: editionArabicInput.value.trim() || "quran-uthmani",
    editionLatin: editionLatinInput.value.trim() || "en.transliteration",
    editionTranslation: editionTranslationInput.value.trim(),
    fontName: optFont.value,
  };
  const filename = (optFilename.value.trim() || "AlQuran-Kindle") + ".epub";
  const sortedNums = Array.from({ length: 114 }, (_, i) => i + 1);
  const total = sortedNums.length;

  try {
    const surahs = await loadSurahList();

    setProgress(
      2,
      "Memuat font Arab...",
      optFont.options[optFont.selectedIndex].text,
    );

    const FONT_LABELS = {
      "scheherazade-new-arabic-400-normal": "Scheherazade New",
      "amiri-quran-400-normal": "Amiri Quran",
      "kfgqpc-hafs-400-normal": "KFGQPC Hafs",
      "kfgqpc-hafs-smart-400-normal": "KFGQPC Hafs Smart",
      "noto-naskh-arabic-400-normal": "Noto Naskh Arabic",
    };

    let fontBase64 = "";
    let fontFamilyName = FONT_LABELS[opts.fontName] || "Arabic Font";

    try {
      const fontRes = await fetch(
        `${import.meta.env.BASE_URL}fonts/${opts.fontName}.woff2`,
      );
      if (!fontRes.ok) {
        throw new Error(`HTTP ${fontRes.status} - file font tidak ditemukan`);
      }
      const fontBuf = await fontRes.arrayBuffer();
      if (fontBuf.byteLength < 1000) {
        throw new Error(
          `File font terlalu kecil (${fontBuf.byteLength} bytes), kemungkinan corrupt`,
        );
      }

      // Fix bug spread operator untuk file besar
      const bytes = new Uint8Array(fontBuf);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      fontBase64 = btoa(binary);

      setProgress(
        4,
        `Font ${fontFamilyName} berhasil dimuat ✓`,
        `${(fontBuf.byteLength / 1024).toFixed(0)} KB`,
      );
    } catch (e) {
      console.error("Font gagal dimuat:", e);
      setProgress(
        4,
        `⚠️ Font ${fontFamilyName} gagal dimuat — harakat mungkin tidak tampil di Kindle`,
        `${e.message}. Pastikan file ada di public/fonts/${opts.fontName}.woff2`,
      );
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }

    const css = buildEpubCss(fontBase64, fontFamilyName);

    setProgress(5, "Memuat teks Arab...", opts.editionArabic);
    const arabicData = await fetchQuranEdition(opts.editionArabic, opts.apiKey);

    setProgress(20, "Memuat transliterasi latin...", opts.editionLatin);
    const latinData = await fetchQuranEdition(opts.editionLatin, opts.apiKey);

    let translationData = null;
    if (opts.editionTranslation) {
      setProgress(35, "Memuat terjemahan...", opts.editionTranslation);
      translationData = await fetchQuranEdition(
        opts.editionTranslation,
        opts.apiKey,
      );
    }

    setProgress(45, "Menggabungkan data ayat...", "");
    const verseDataMap = mergeQuranEditions(
      arabicData,
      latinData,
      translationData,
    );

    setProgress(50, "Menyusun konten EPUB...", "");
    const surahMetaMap = Object.fromEntries(surahs.map((s) => [s.surah_id, s]));

    const chapters = sortedNums.map((num, i) => {
      const meta = surahMetaMap[num];
      const verses = verseDataMap[num];
      const surahMeta = {
        num,
        name: meta.surah_name,
        nameAr: meta.surah_name_arabic.trim(),
        nameBahasa: meta.surah_name_bahasa,
        revType: MAKKIYAH.has(num) ? "Makkiyah" : "Madaniyah",
        verseCount: meta.surah_verse_count,
      };
      const pct = 50 + ((i + 1) / total) * 25;
      setProgress(
        pct,
        "Menyusun konten...",
        `Surah ${num}: ${meta.surah_name}`,
      );
      return {
        title: `${num}. ${meta.surah_name} (${meta.surah_name_arabic.trim()})`,
        content: buildSurahHtml(surahMeta, verses, opts),
        filename: `surah_${String(num).padStart(3, "0")}.xhtml`,
      };
    });

    setProgress(
      78,
      "Membuat file EPUB...",
      "Ini mungkin membutuhkan beberapa detik",
    );

    const blob = await epub(
      {
        title: "Al-Quran Al-Karim - Latin Transliteration",
        author: "Allah",
        publisher: "",
        cover:
          "https://m.media-amazon.com/images/S/compressed.photo.goodreads.com/books/1275263838i/646462.jpg",
        customOpfMetadata: `
            <dc:identifier>goodreads:646462</dc:identifier>
            <dc:identifier>amazon:B0DTR624WB</dc:identifier>
          `,
        description: `The Quran (English pronunciation: /kɔrˈɑːn/; Arabic: القرآن‎ al-qurʾān, IPA: [qurˈʔaːn], literally meaning "the recitation"), also transliterated Qur'an, Koran, Al-Coran, Coran, Kur'an, and Al-Qur'an, is the central religious text of Islam, which Muslims believe to be the verbatim word of God (Arabic: الله‎, Allah). `,
        lang: "",
        tocTitle: "Daftar Surah",
        css,
        numberChaptersInTOC: false,
        prependChapterTitles: false,
        version: 3,
      },
      chapters,
    );

    setProgress(100, "Selesai! Mengunduh...", filename);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    setTimeout(() => {
      progressTitle.textContent = "EPUB berhasil dibuat!";
      progressDetail.textContent = `${total} surah - ${filename}`;
    }, 500);
  } catch (err) {
    console.error(err);
    setProgress(0, "Gagal membuat EPUB", err.message);
  } finally {
    btnGenerate.disabled = false;
    btnGenerate.classList.remove("loading");
  }
}

btnGenerate.addEventListener("click", generate);

loadEditionOptions();

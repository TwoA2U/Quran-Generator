/**
 * Al-Quran EPUB Generator - Browser-side
 * Browser flow: fetch AlQuran.cloud API -> generate EPUB -> download
 */

import epub from 'epub-gen-memory/bundle'
const btnGenerate = document.getElementById('btn-generate')
const optPage = document.getElementById('opt-page')
const optFilename = document.getElementById('opt-filename')
const apiKeyInput = document.getElementById('api-key')
const editionArabicInput = document.getElementById('edition-arabic')
const editionLatinInput = document.getElementById('edition-latin')
const editionTranslationInput = document.getElementById('edition-translation')
const progressCard = document.getElementById('section-progress')
const progressBar = document.getElementById('progress-bar')
const progressPct = document.getElementById('progress-pct')
const progressTitle = document.getElementById('progress-title')
const progressDetail = document.getElementById('progress-detail')

async function loadSurahList() {
  const res = await fetch('./data/surah.json')
  return res.json()
}

function setProgress(pct, title, detail = '') {
  progressCard.style.display = 'block'
  progressBar.style.width = pct + '%'
  progressPct.textContent = Math.round(pct) + '%'
  progressTitle.textContent = title
  progressDetail.textContent = detail
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function stripHtml(value = '') {
  const doc = new DOMParser().parseFromString(String(value), 'text/html')
  return doc.body.textContent || ''
}

function buildApiUrl(path, apiKey) {
  const url = new URL(`https://api.alquran.cloud/v1/${path}`)
  if (apiKey) url.searchParams.set('apikey', apiKey)
  return url.toString()
}

function renderEditionOptions(selectEl, editions, defaultIdentifier, emptyLabel = '') {
  selectEl.innerHTML = ''
  if (emptyLabel) {
    const option = document.createElement('option')
    option.value = ''
    option.textContent = emptyLabel
    selectEl.appendChild(option)
  }
  editions.forEach(edition => {
    const option = document.createElement('option')
    option.value = edition.identifier
    option.textContent = `${edition.identifier} - ${edition.name}${edition.englishName && edition.englishName !== 'Unknown' ? ` (${edition.englishName})` : ''}`
    selectEl.appendChild(option)
  })
  selectEl.value = editions.some(edition => edition.identifier === defaultIdentifier)
    ? defaultIdentifier
    : emptyLabel ? '' : editions[0]?.identifier || ''
}

async function loadEditionOptions() {
  try {
    const editions = await fetchJson(buildApiUrl('edition?format=text', ''))
    const arabicEditions = editions.filter(edition =>
      edition.language === 'ar' && edition.type === 'quran'
    )
    const latinEditions = editions.filter(edition =>
      edition.type === 'transliteration' ||
      edition.identifier.toLowerCase().includes('transliteration')
    )
    const translationEditions = editions
      .filter(edition => edition.type === 'translation')
      .sort((a, b) => `${a.language}.${a.name}`.localeCompare(`${b.language}.${b.name}`))

    if (arabicEditions.length) {
      renderEditionOptions(editionArabicInput, arabicEditions, 'quran-uthmani')
    }
    if (latinEditions.length) {
      renderEditionOptions(editionLatinInput, latinEditions, 'en.transliteration')
    }
    if (translationEditions.length) {
      renderEditionOptions(editionTranslationInput, translationEditions, 'id.indonesian', 'Tanpa terjemahan')
    }
  } catch (err) {
    console.warn('Daftar edisi gagal dimuat, pakai opsi bawaan:', err)
  }
}

async function fetchJson(url) {
  const res = await fetch(url, { method: 'GET' })
  if (!res.ok) throw new Error(`API gagal (${res.status}) saat memuat ${url}`)

  const json = await res.json()
  if (json.code && json.code !== 200) {
    throw new Error(json.status || `API gagal (${json.code})`)
  }
  return json.data
}

async function fetchSurahFromApi(num, opts) {
  const editionIds = [opts.editionArabic, opts.editionLatin, opts.editionTranslation].filter(Boolean)
  const editions = editionIds.map(edition => encodeURIComponent(edition)).join(',')
  const data = await fetchJson(buildApiUrl(`surah/${num}/editions/${editions}`, opts.apiKey))
  const editionList = Array.isArray(data) ? data : []
  const arabicEdition = editionList.find(item => item.edition?.identifier === opts.editionArabic) || editionList[0]
  const latinEdition = editionList.find(item => item.edition?.identifier === opts.editionLatin) || editionList[1]
  const translationEdition = opts.editionTranslation
    ? editionList.find(item => item.edition?.identifier === opts.editionTranslation)
    : null

  if (!arabicEdition?.ayahs?.length) {
    throw new Error(`Data Arab surah ${num} kosong. Cek edisi "${opts.editionArabic}".`)
  }

  const latinByAyah = new Map((latinEdition?.ayahs || []).map(ayah => [ayah.numberInSurah, ayah]))
  const translationByAyah = new Map((translationEdition?.ayahs || []).map(ayah => [ayah.numberInSurah, ayah]))

  return arabicEdition.ayahs.map(ayah => {
    const latin = latinByAyah.get(ayah.numberInSurah)
    const translation = translationByAyah.get(ayah.numberInSurah)
    return {
      ayah_number: ayah.numberInSurah,
      page_number: ayah.page,
      script: ayah.text,
      latin: stripHtml(latin?.text || ''),
      translation: stripHtml(translation?.text || ''),
    }
  })
}

function buildEpubCss(fontBase64) {
  const fontFace = fontBase64
    ? `@font-face {
    font-family: "Scheherazade New";
    font-weight: 400;
    font-style: normal;
    src: url("data:font/woff2;base64,${fontBase64}") format("woff2");
  }`
    : ''

  return `
    ${fontFace}
    body { font-family: serif; margin: 1em; padding: 0; color: #000; }
    .surah-header { text-align: center; margin-bottom: 1.2em; padding: 0.6em 0;
      border-top: 1px solid #000; border-bottom: 1px solid #000; }
    .surah-number { font-size: 0.85em; font-weight: bold; display: block; margin-bottom: 0.3em; }
    .surah-name-arabic { font-family: "Scheherazade New", "Amiri", "Traditional Arabic", serif;
      font-size: 2em; direction: rtl; display: block; margin: 0.2em 0; }
    .surah-name-latin { font-size: 1.05em; font-weight: bold; display: block; }
    .surah-meta { font-size: 0.8em; display: block; margin-top: 0.3em; }
    .ayah-block { margin-bottom: 1.2em; padding-bottom: 0.8em; border-bottom: 1px solid #ccc; }
    .ayah-block:last-child { border-bottom: none; }
    .arabic-text { font-family: "Scheherazade New", "Amiri", "KFGQPC Uthmanic Script Hafs", "Traditional Arabic", serif;
      font-size: 1.75em; line-height: 2.1; direction: rtl; text-align: right; display: block; margin-bottom: 0.35em; }
    .latin-line { font-size: 0.85em; line-height: 1.55; color: #222; }
    .translation-line { font-size: 0.85em; line-height: 1.55; color: #222; margin-top: 0.25em; }
    .ayah-num-inline { font-weight: bold; margin-right: 0.3em; }
    .page-ref { font-size: 0.82em; color: #333; margin-left: 0.4em; }
  `
}

function buildSurahHtml(surahMeta, verses, opts) {
  const { num, name, nameAr, nameBahasa, revType, verseCount } = surahMeta

  const blocks = verses.map(v => {
    const pageHtml = opts.showPage && v.page_number
      ? `<span class="page-ref">(Hal. ${v.page_number})</span>`
      : ''
    const translationHtml = opts.editionTranslation && v.translation
      ? `<p class="translation-line">${escapeHtml(v.translation)}</p>`
      : ''

    return `
      <div class="ayah-block">
        <p class="arabic-text">${escapeHtml(v.script)} &#x06DD;${v.ayah_number}&#x06DD;</p>
        <p class="latin-line">
          <span class="ayah-num-inline">${v.ayah_number}.</span>${escapeHtml(v.latin)} ${pageHtml}
        </p>
        ${translationHtml}
      </div>`
  }).join('\n')

  return `
    <div class="surah-header">
      <p class="surah-number">Surah ${num}</p>
      <p class="surah-name-arabic">${escapeHtml(nameAr)}</p>
      <p class="surah-name-latin">${escapeHtml(name)} - ${escapeHtml(nameBahasa)}</p>
      <p class="surah-meta">${revType} - ${verseCount} Ayat</p>
    </div>
    ${blocks}
  `
}

const MAKKIYAH = new Set([
  1, 6, 7, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 23, 25, 26, 27, 28, 29,
  30, 31, 32, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 50, 51, 52, 53,
  54, 55, 56, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83,
  84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 100, 101, 102, 103,
  104, 105, 106, 107, 108, 109, 111, 112, 113, 114,
])

async function generate() {
  btnGenerate.disabled = true
  btnGenerate.classList.add('loading')
  progressCard.style.display = 'block'

  const opts = {
    showPage: optPage.checked,
    apiKey: apiKeyInput.value.trim(),
    editionArabic: editionArabicInput.value.trim() || 'quran-uthmani',
    editionLatin: editionLatinInput.value.trim() || 'en.transliteration',
    editionTranslation: editionTranslationInput.value.trim(),
  }
  const filename = (optFilename.value.trim() || 'AlQuran-Kindle') + '.epub'
  const sortedNums = Array.from({ length: 114 }, (_, i) => i + 1)
  const total = sortedNums.length

  try {
    const surahs = await loadSurahList()

    setProgress(2, 'Memuat font Arab...', 'Scheherazade New')
    let fontBase64 = ''
    try {
      const fontRes = await fetch('./fonts/scheherazade-new-arabic-400-normal.woff2')
      const fontBuf = await fontRes.arrayBuffer()
      fontBase64 = btoa(String.fromCharCode(...new Uint8Array(fontBuf)))
    } catch (e) {
      console.warn('Font tidak bisa dimuat, lanjut tanpa embed font:', e)
    }

    const css = buildEpubCss(fontBase64)

    setProgress(5, 'Memuat data dari AlQuran.cloud...', `0 / ${total} surah`)
    const verseDataMap = {}
    for (let i = 0; i < sortedNums.length; i++) {
      const num = sortedNums[i]
      verseDataMap[num] = await fetchSurahFromApi(num, opts)
      const pct = 5 + ((i + 1) / total) * 40
      setProgress(pct, 'Memuat data dari AlQuran.cloud...', `${i + 1} / ${total} surah dimuat`)
    }

    setProgress(50, 'Menyusun konten EPUB...', '')
    const surahMetaMap = Object.fromEntries(surahs.map(s => [s.surah_id, s]))

    const chapters = sortedNums.map((num, i) => {
      const meta = surahMetaMap[num]
      const verses = verseDataMap[num]
      const surahMeta = {
        num,
        name: meta.surah_name,
        nameAr: meta.surah_name_arabic.trim(),
        nameBahasa: meta.surah_name_bahasa,
        revType: MAKKIYAH.has(num) ? 'Makkiyah' : 'Madaniyah',
        verseCount: meta.surah_verse_count,
      }
      const pct = 50 + ((i + 1) / total) * 25
      setProgress(pct, 'Menyusun konten...', `Surah ${num}: ${meta.surah_name}`)
      return {
        title: `${num}. ${meta.surah_name} (${meta.surah_name_arabic.trim()})`,
        content: buildSurahHtml(surahMeta, verses, opts),
        filename: `surah_${String(num).padStart(3, '0')}.xhtml`,
      }
    })

    setProgress(78, 'Membuat file EPUB...', 'Ini mungkin membutuhkan beberapa detik')

    const blob = await epub(
      {
        title: 'Al-Quran Al-Karim - Latin Transliteration',
        author: 'AlQuran.cloud',
        publisher: 'AlQuran.cloud',
        description: 'Al-Quran untuk Kindle dengan teks Arab, nomor ayat, nomor halaman mushaf, transliterasi latin, dan terjemahan opsional.',
        lang: 'id',
        tocTitle: 'Daftar Surah',
        css,
        numberChaptersInTOC: false,
        prependChapterTitles: false,
        version: 3,
      },
      chapters
    )

    setProgress(100, 'Selesai! Mengunduh...', filename)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 5000)

    setTimeout(() => {
      progressTitle.textContent = 'EPUB berhasil dibuat!'
      progressDetail.textContent = `${total} surah - ${filename}`
    }, 500)
  } catch (err) {
    console.error(err)
    setProgress(0, 'Gagal membuat EPUB', err.message)
  } finally {
    btnGenerate.disabled = false
    btnGenerate.classList.remove('loading')
  }
}

btnGenerate.addEventListener('click', generate)

loadEditionOptions()

/**
 * Al-Quran EPUB Generator — Browser-side
 * Semua berjalan di browser: fetch data JSON lokal → generate EPUB → download
 */

import epub from 'epub-gen-memory/bundle'

// ── State ─────────────────────────────────────────────────────────────────────
let allSurahs = []          // metadata semua surah dari surah.json
let selectedNums = new Set() // nomor surah yang dipilih

// Juz 30 = surah 78–114
const JUZ30 = Array.from({ length: 37 }, (_, i) => i + 78)

// ── DOM refs ──────────────────────────────────────────────────────────────────
const grid         = document.getElementById('surah-grid')
const searchBox    = document.getElementById('surah-search')
const countEl      = document.getElementById('selection-count')
const btnGenerate  = document.getElementById('btn-generate')
const btnAll       = document.getElementById('btn-select-all')
const btnJuz30     = document.getElementById('btn-select-juz30')
const btnClear     = document.getElementById('btn-clear')
const optTafsir    = document.getElementById('opt-tafsir')
const optPage      = document.getElementById('opt-page')
const optFilename  = document.getElementById('opt-filename')
const progressCard = document.getElementById('section-progress')
const progressBar  = document.getElementById('progress-bar')
const progressPct  = document.getElementById('progress-pct')
const progressTitle = document.getElementById('progress-title')
const progressDetail = document.getElementById('progress-detail')

// ── Load surah metadata ───────────────────────────────────────────────────────
async function loadSurahList() {
  const res = await fetch('./data/surah.json')
  allSurahs = await res.json()
  renderGrid(allSurahs)
}

// ── Render surah grid ─────────────────────────────────────────────────────────
function renderGrid(list) {
  grid.innerHTML = ''
  if (list.length === 0) {
    grid.innerHTML = '<p class="loading-surah">Tidak ada surah yang cocok.</p>'
    return
  }
  list.forEach(s => {
    const card = document.createElement('div')
    card.className = 'surah-card' + (selectedNums.has(s.surah_id) ? ' selected' : '')
    card.dataset.id = s.surah_id
    card.innerHTML = `
      <div class="surah-card-num">Surah ${s.surah_id}</div>
      <span class="surah-card-ar">${s.surah_name_arabic}</span>
      <div class="surah-card-name">${s.surah_name}</div>
    `
    card.addEventListener('click', () => toggleSurah(s.surah_id, card))
    grid.appendChild(card)
  })
}

function toggleSurah(id, el) {
  if (selectedNums.has(id)) {
    selectedNums.delete(id)
    el.classList.remove('selected')
  } else {
    selectedNums.add(id)
    el.classList.add('selected')
  }
  updateCount()
}

function updateCount() {
  const n = selectedNums.size
  countEl.textContent = n === 0
    ? 'Belum ada surah dipilih'
    : `${n} surah dipilih (${[...selectedNums].sort((a,b) => a-b).slice(0,5).join(', ')}${n > 5 ? '...' : ''})`
  btnGenerate.disabled = n === 0
}

// ── Toolbar buttons ───────────────────────────────────────────────────────────
btnAll.addEventListener('click', () => {
  selectedNums = new Set(allSurahs.map(s => s.surah_id))
  document.querySelectorAll('.surah-card').forEach(c => c.classList.add('selected'))
  updateCount()
})

btnJuz30.addEventListener('click', () => {
  JUZ30.forEach(id => selectedNums.add(id))
  document.querySelectorAll('.surah-card').forEach(c => {
    if (JUZ30.includes(Number(c.dataset.id))) c.classList.add('selected')
  })
  updateCount()
})

btnClear.addEventListener('click', () => {
  selectedNums.clear()
  document.querySelectorAll('.surah-card').forEach(c => c.classList.remove('selected'))
  updateCount()
})

// ── Search ────────────────────────────────────────────────────────────────────
searchBox.addEventListener('input', () => {
  const q = searchBox.value.toLowerCase().trim()
  const filtered = q
    ? allSurahs.filter(s =>
        s.surah_name.toLowerCase().includes(q) ||
        s.surah_name_bahasa.toLowerCase().includes(q) ||
        String(s.surah_id).includes(q)
      )
    : allSurahs
  renderGrid(filtered)
})

// ── Progress helper ───────────────────────────────────────────────────────────
function setProgress(pct, title, detail = '') {
  progressCard.style.display = 'block'
  progressBar.style.width = pct + '%'
  progressPct.textContent = Math.round(pct) + '%'
  progressTitle.textContent = title
  progressDetail.textContent = detail
}

// ── EPUB CSS (Kindle-friendly, font embedded via URL) ────────────────────────
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
    body { font-family: serif; margin: 1em; padding: 0; }
    .surah-header { text-align: center; margin-bottom: 1.5em; padding: 0.8em 0;
      border-top: 1px solid #000; border-bottom: 1px solid #000; }
    .surah-number { font-size: 0.85em; font-weight: bold; display: block; margin-bottom: 0.3em; }
    .surah-name-arabic { font-family: "Scheherazade New", "Amiri", "Traditional Arabic", serif;
      font-size: 2.2em; direction: rtl; display: block; margin: 0.2em 0; }
    .surah-name-latin { font-size: 1.1em; font-weight: bold; display: block; }
    .surah-meta { font-size: 0.8em; display: block; margin-top: 0.3em; }
    .basmalah { font-family: "Scheherazade New", "Amiri", "Traditional Arabic", serif;
      font-size: 1.8em; direction: rtl; text-align: center; display: block;
      margin: 1em 0; padding: 0.5em 0;
      border-top: 1px solid #999; border-bottom: 1px solid #999; }
    .ayah-block { margin-bottom: 1.5em; padding-bottom: 1em; border-bottom: 1px solid #ccc; }
    .ayah-block:last-child { border-bottom: none; }
    .arabic-text { font-family: "Scheherazade New", "Amiri", "KFGQPC Uthmanic Script Hafs", "Traditional Arabic", serif;
      font-size: 1.8em; line-height: 2.2; direction: rtl; text-align: right; display: block; margin-bottom: 0.4em; }
    .translation-line { font-size: 0.82em; line-height: 1.6; color: #333; }
    .ayah-num-inline { font-weight: bold; margin-right: 0.3em; }
    .page-ref { font-size: 0.85em; color: #666; margin-left: 0.4em; }
    .tafsir-box { font-size: 0.78em; font-style: italic; color: #555; margin-top: 0.4em;
      padding-left: 0.5em; border-left: 2px solid #999; }
    .tafsir-label { font-style: normal; font-weight: bold; display: block; margin-bottom: 0.2em; }
  `
}

// ── Build single surah chapter HTML ──────────────────────────────────────────
function buildSurahHtml(surahMeta, verses, opts) {
  const { num, name, nameAr, nameBahasa, revType, verseCount } = surahMeta

  const basmalah = (num !== 1 && num !== 9)
    ? '<p class="basmalah">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</p>'
    : ''

  const blocks = verses.map(v => {
    const pageHtml = opts.showPage && v.page_number
      ? `<span class="page-ref">(Hal. ${v.page_number})</span>`
      : ''
    const tafsirHtml = opts.showTafsir && v.tafsir?.short
      ? `<div class="tafsir-box"><span class="tafsir-label">Tafsir Ringkas</span>${v.tafsir.short}</div>`
      : ''
    return `
      <div class="ayah-block">
        <p class="arabic-text">${v.verse_arabic} &#x06DD;${v.verse_number}&#x06DD;</p>
        <p class="translation-line">
          <span class="ayah-num-inline">${v.verse_number}.</span>${v.verse_bahasa} ${pageHtml}
        </p>
        ${tafsirHtml}
      </div>`
  }).join('\n')

  return `
    <div class="surah-header">
      <p class="surah-number">Surah ${num}</p>
      <p class="surah-name-arabic">${nameAr}</p>
      <p class="surah-name-latin">${name} — ${nameBahasa}</p>
      <p class="surah-meta">${revType} · ${verseCount} Ayat</p>
    </div>
    ${basmalah}
    ${blocks}
  `
}

// ── Revelation type lookup ────────────────────────────────────────────────────
const MAKKIYAH = new Set([
  1,6,7,10,11,12,13,14,15,16,17,18,19,20,21,23,25,26,27,28,29,
  30,31,32,34,35,36,37,38,39,40,41,42,43,44,45,46,50,51,52,53,
  54,55,56,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,
  84,85,86,87,88,89,90,91,92,93,94,95,96,97,100,101,102,103,
  104,105,106,107,108,109,111,112,113,114
])

// ── Main generate function ────────────────────────────────────────────────────
async function generate() {
  btnGenerate.disabled = true
  btnGenerate.classList.add('loading')
  progressCard.style.display = 'block'

  const opts = {
    showTafsir: optTafsir.checked,
    showPage:   optPage.checked,
  }
  const filename = (optFilename.value.trim() || 'AlQuran-Kemenag') + '.epub'
  const sortedNums = [...selectedNums].sort((a, b) => a - b)
  const total = sortedNums.length

  try {
    // Step 1: Load font
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

    // Step 2: Load all verse data
    setProgress(5, 'Memuat data ayat...', `0 / ${total} surah`)
    const verseDataMap = {}
    for (let i = 0; i < sortedNums.length; i++) {
      const num = sortedNums[i]
      const res = await fetch(`./data/verses/${num}.json`)
      verseDataMap[num] = await res.json()
      const pct = 5 + ((i + 1) / total) * 40
      setProgress(pct, 'Memuat data ayat...', `${i + 1} / ${total} surah dimuat`)
    }

    // Step 3: Build EPUB chapters
    setProgress(50, 'Menyusun konten EPUB...', '')
    const surahMetaMap = Object.fromEntries(allSurahs.map(s => [s.surah_id, s]))

    const chapters = sortedNums.map((num, i) => {
      const meta = surahMetaMap[num]
      const verses = verseDataMap[num]
      const surahMeta = {
        num,
        name:       meta.surah_name,
        nameAr:     meta.surah_name_arabic.trim(),
        nameBahasa: meta.surah_name_bahasa,
        revType:    MAKKIYAH.has(num) ? 'Makkiyah' : 'Madaniyah',
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

    // Step 4: Generate EPUB
    setProgress(78, 'Membuat file EPUB...', 'Ini mungkin membutuhkan beberapa detik')

    const blob = await epub(
      {
        title:       'Al-Quran Al-Karim — Terjemahan Kemenag RI',
        author:      'Terjemahan: Kementerian Agama RI',
        publisher:   'Kementerian Agama Republik Indonesia',
        description: 'Al-Quran lengkap dengan teks Arab dan terjemahan resmi Kementerian Agama RI.',
        lang:        'id',
        tocTitle:    'Daftar Surah',
        css,
        numberChaptersInTOC: false,
        prependChapterTitles: false,
        version: 3,
      },
      chapters
    )

    // Step 5: Trigger download
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
      progressTitle.textContent = '✓ EPUB berhasil dibuat!'
      progressDetail.textContent = `${total} surah · ${filename}`
    }, 500)

  } catch (err) {
    console.error(err)
    setProgress(0, '✗ Gagal membuat EPUB', err.message)
  } finally {
    btnGenerate.disabled = false
    btnGenerate.classList.remove('loading')
  }
}

btnGenerate.addEventListener('click', generate)

// ── Init ──────────────────────────────────────────────────────────────────────
loadSurahList()
updateCount()

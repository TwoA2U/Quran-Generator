# Al-Quran EPUB Generator

Web app untuk generate EPUB Al-Quran langsung di browser.

**Fitur:**
- 114 Surah lengkap — terjemahan resmi Kementerian Agama RI
- Pilih surah individual, semua, atau Juz 30
- Opsi tafsir ringkas & nomor halaman Mushaf Madinah
- Font Scheherazade New embedded — harakat tampil sempurna di Kindle
- Generate EPUB 100% di browser, tanpa server

## Deploy ke GitHub Pages

### 1. Fork / clone repo ini

### 2. Enable GitHub Pages via Actions
Masuk ke **Settings → Pages → Source → GitHub Actions**

### 3. Push ke branch `main`
GitHub Actions otomatis build dan deploy.

## Development lokal

```bash
npm install
npm run dev
```

Buka `http://localhost:5173`

## Build lokal

```bash
npm run build
# output di folder dist/
```

## Struktur

```
├── public/
│   ├── index.html        # UI utama
│   ├── style.css         # Styling
│   ├── main.js           # Logic: load data + generate EPUB
│   ├── fonts/            # Scheherazade New (woff2)
│   └── data/
│       ├── surah.json    # Metadata 114 surah
│       └── verses/       # 1.json — 114.json (data ayat per surah)
├── .github/
│   └── workflows/
│       └── deploy.yml    # GitHub Actions: build + deploy ke Pages
├── package.json
└── vite.config.js
```

## Sumber Data

- **Terjemahan**: [quran.kemenag.go.id](https://quran.kemenag.go.id) via [quran-kemenag](https://www.npmjs.com/package/quran-kemenag)
- **Font**: [Scheherazade New](https://software.sil.org/scheherazade/) (SIL Open Font License)
- **EPUB library**: [epub-gen-memory](https://www.npmjs.com/package/epub-gen-memory)

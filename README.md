# Al-Quran EPUB Generator

Web app untuk generate EPUB Al-Quran langsung di browser.

**Fitur:**
- Bebagai Arabic Font — Bisa untuk Kindle/E-reader
- Generate EPUB 100% di browser, tanpa server

## Development lokal

```bash
npm install
npm run dev
```

## Build lokal

```bash
npm run build
# output di folder dist/
```

## Struktur

```
Quran-Generator/
├── .github/
│   └── workflows/
│       └── deploy.yml
├── .gitignore
├── README.md
├── index.html
├── package-lock.json
├── package.json
├── public/
│   ├── data/
│   │   └── surah.json
│   └── fonts/
│       ├── Amiri-1.003.zip
│       ├── amiri-quran-400-normal.ttf
│       ├── amiri-quran-400-normal.woff2
│       ├── kfgqpc-hafs-400-normal.ttf
│       ├── kfgqpc-hafs-400-normal.woff2
│       ├── kfgqpc-hafs-smart-400-normal.ttf
│       ├── kfgqpc-hafs-smart-400-normal.woff2
│       ├── noto-naskh-arabic-400-normal.woff2
│       ├── scheherazade-new-arabic-400-normal.ttf
│       └── scheherazade-new-arabic-400-normal.woff2
├── src/
│   ├── main.js
│   └── style.css
└── vite.config.js
```

## Sumber Data

- **Terjemahan**: [quran.kemenag.go.id](https://quran.kemenag.go.id) via [quran-kemenag](https://www.npmjs.com/package/quran-kemenag)
- **Font**: [Scheherazade New](https://software.sil.org/scheherazade/) (SIL Open Font License)
- **EPUB library**: [epub-gen-memory](https://www.npmjs.com/package/epub-gen-memory)

## Sumber Font

- [KFGQPC](https://github.com/thetruetruth/quran-data-kfgqpc)
- [Amiri](https://github.com/aliftype/amiri/releases/tag/1.003)
- [Noto Naskh](https://fonts.google.com/selection?preview.script=Arab&query=Noto+Naskh)

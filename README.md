# Brük 🌉

**Offline German ↔ English Voice, Camera & Text Translator**

> *From the German **Brücke** (bridge) — connecting languages without an internet connection.*

---

## What it does

Brük is a privacy-first Progressive Web App that translates between German and English entirely on your device. No servers. No API keys. No data ever leaves your phone.

| Input method | How it works |
|---|---|
| 🎙️ **Voice** | Speak naturally — Whisper transcribes offline, then Helsinki-NLP translates |
| 📷 **Camera** | Point at a sign, menu or label — Tesseract.js extracts and translates the text |
| ⌨️ **Text** | Type anything and tap Translate |

**Bonus:** when pointing at food packaging, Brük detects whether ingredients are 🟢 Vegan, 🟡 Vegetarian, or 🔴 Non-Vegetarian.

---

## Two modes

**Quick** — single phrase or sentence. Ideal for signs, menus, quick questions.

**Gespräch** (Conversation) — turn-by-turn dialogue between two people. Perfect for doctor visits, shops, or immigration offices where two people need to communicate.

---

## Tech stack

| Role | Technology |
|---|---|
| Translation | [Helsinki-NLP Opus-MT](https://huggingface.co/Helsinki-NLP) via [Transformers.js](https://github.com/xenova/transformers.js) |
| Speech recognition | [Whisper base](https://huggingface.co/openai/whisper-base) (ONNX) via Transformers.js |
| Text-to-speech | Web Speech API (device built-in — no download) |
| OCR | [Tesseract.js](https://github.com/naptha/tesseract.js) v5 — German + English |
| Diet detection | JavaScript keyword matching — no AI needed |
| Offline support | Service Worker + Cache Storage |
| Hosting | GitHub Pages (any static host works) |

**No backend. No API keys. No cost to run.**

---

## Model sizes (downloaded once on first use)

| Model | Size (quantised ONNX) |
|---|---|
| opus-mt-de-en | ~75 MB |
| opus-mt-en-de | ~75 MB |
| whisper-base | ~75 MB |
| Tesseract deu+eng | ~10 MB |
| **Total** | **~235 MB** |

Models are stored in the browser's Cache Storage after the first download. Subsequent launches are fully offline.

### First-run notes

- Open the app on Wi-Fi and tap **Settings → Download All Models** to preload everything at once.
- Alternatively, models download automatically the first time each feature is used.
- After download, the app works fully offline — on a plane, underground, wherever.

---

## Browser compatibility

| Browser | Translation | Voice | Camera | Install as app |
|---|---|---|---|---|
| Chrome / Edge (Android, Windows, macOS) | ✅ | ✅ | ✅ | ✅ |
| Firefox (Android, Desktop) | ✅ | ✅ | ✅ | ✅ |
| Safari (iOS 16.4+, macOS) | ✅ | ✅ | ✅ | ✅ (Add to Home Screen) |
| Samsung Internet | ✅ | ✅ | ✅ | ✅ |

> **iOS note:** Whisper offline transcription requires WebAssembly SIMD support (iOS 16.4+). On older iOS, Brük automatically falls back to the device's built-in speech recognition (requires internet).

---

## Project structure

```
bruk/
├── index.html          ← App shell + security meta headers
├── manifest.json       ← PWA manifest (icons, shortcuts, display)
├── sw.js               ← Service worker (offline cache strategy)
├── css/
│   └── style.css       ← Design system (dark/light, CSS custom properties)
├── js/
│   ├── main.js         ← App entry point & event orchestration
│   ├── config.js       ← Central configuration (model IDs, limits, keys)
│   ├── loader.js       ← Shared Transformers.js dynamic import
│   ├── translation.js  ← Helsinki-NLP translation pipeline
│   ├── speech-input.js ← Whisper recording + Web Speech fallback
│   ├── speech-output.js← Web Speech API TTS
│   ├── camera.js       ← Camera viewfinder + Tesseract.js OCR
│   ├── diet.js         ← Ingredient keyword detection
│   ├── timer.js        ← Voice recording countdown ring
│   └── ui.js           ← DOM helpers, toasts, modals, state rendering
├── data/
│   └── diet-keywords.json ← Veg/non-veg keyword lists (DE + EN)
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

---

## Security

- **Content Security Policy** is declared via `<meta>` tag (GitHub Pages does not allow custom HTTP headers).
- All model fetches are restricted to `huggingface.co` and `cdn.jsdelivr.net`.
- No cookies, no analytics, no third-party tracking of any kind.
- Microphone and camera are only accessed on explicit user tap; streams are stopped immediately after use.
- All data stays on-device. Conversation exports are plain text files saved locally.

---

## Known limitations

| Limitation | Detail |
|---|---|
| Translation quality | Helsinki-NLP is excellent for everyday language but may miss idioms and slang |
| Whisper accuracy | ~3–5 sec processing time on mid-range phones; quality varies with accent |
| OCR on poor lighting | Tesseract struggles with reflective packaging and curved surfaces |
| Diet detection | Keyword-based — won't catch unlisted derivative ingredients |
| First load | ~235 MB — requires Wi-Fi, takes 2–5 minutes |
| iOS TTS voices | Voice selection varies by device; generally good on modern iOS |

---

## Comparison

| Feature | Google Translate | iTranslate | **Brük** |
|---|---|---|---|
| Offline translation | Partial (manual) | Paid only | ✅ Free, automatic |
| Camera OCR | ✅ | ✅ | ✅ |
| Voice translation | ✅ | ✅ | ✅ |
| Diet / veg detection | ❌ | ❌ | ✅ |
| No data sent to servers | ❌ | ❌ | ✅ |
| Free forever | ❌ | ❌ | ✅ |
| No app store needed | ❌ | ❌ | ✅ |

---

## Contributing

Issues and pull requests are welcome. Please open an issue before starting large changes.

---

## License

MIT — see [LICENSE](./LICENSE)

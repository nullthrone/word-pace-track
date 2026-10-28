# 🤝 Contributing to Word Pace

Thanks for taking a look! Bug reports, measurement comparisons and small focused pull requests are all welcome.

## 🧭 Ground rules

The project keeps a few promises. Every change has to keep them:

- **One file.** The app is `index.html` with inline CSS and JavaScript. No framework, no build step, no CDN, no web fonts.
- **No data leaves the page.** No analytics, no `fetch`, no storage (`localStorage`, cookies, IndexedDB). Settings live in the URL fragment only. The Content-Security-Policy meta tag enforces this; do not loosen it.
- **Pure logic stays pure.** Counting, windowing and settings live in `<script id="wpt-core">` without DOM access, so `tests/core.test.mjs` can load that block on its own.
- **Design system.** The look follows the Nullthrone design system: tokens as CSS custom properties, square corners, hairlines, ink on paper, no emoji in the UI.

## 🛠️ Local setup

```bash
git clone https://github.com/nullthrone/word-pace-track.git
cd word-pace-track
npm start            # serves http://localhost:8000 (python3 -m http.server)
```

Open `http://localhost:8000/?demo=1` to test the display without a microphone. The microphone works on `localhost` and HTTPS only.

## ✅ Tests

```bash
npm test                                   # unit tests, no dependencies
npm install --no-save playwright@1.63.0    # once, for the browser test
npx playwright install chromium            # once
npm run test:browser                       # demo mode in headless Chromium
```

CI runs both on every pull request; `main` deploys to GitHub Pages after they pass.

## 📏 Measurement reports

Measurement issues are the most useful ones. Please include the text length in words, your stopwatch time, the WPM the page showed, the browser and the language setting.

## 📬 Pull requests

- Keep each PR to one change and say why it is needed.
- Add or update a unit test when you touch `wpt-core`.
- Describe how you checked it in Chrome and Safari if the change touches recognition or the pop-out.

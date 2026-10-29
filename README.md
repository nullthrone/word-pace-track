<div align="center">

# 🎙️ Word Pace

**See how fast you speak, live, in words per minute.**
One HTML file. Runs in your browser. Stores nothing.

[![Test and deploy](https://github.com/nullthrone/word-pace-track/actions/workflows/pages.yml/badge.svg)](https://github.com/nullthrone/word-pace-track/actions/workflows/pages.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-A87E2F.svg)](LICENSE)
[![Single file](https://img.shields.io/badge/build-none%20·%20one%20HTML%20file-141317.svg)](index.html)
[![No tracking](https://img.shields.io/badge/tracking-none-2F6B4F.svg)](#-privacy)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-support%20tsprock-FF5E5B?logo=ko-fi&logoColor=white)](https://ko-fi.com/tsprock)

### 👉 [Open Word Pace](https://nullthrone.github.io/word-pace-track/) · [Try the demo](https://nullthrone.github.io/word-pace-track/?demo=1)

<img src="docs/screenshot-light.png" alt="Word Pace showing 99 WPM in red, labelled 'Too slow', with the gauge below" width="420">

</div>

---

## 🤔 Why

Most people speak faster than they think, and faster still when they know the material or feel nervous. Listeners hearing it for the first time fall behind, and in a recording, a talk or a video call nobody stops you to say so. Your own sense of speed is a poor judge, because you already know what comes next.

Word Pace gives you an outside reference while you speak: a live words-per-minute number, and a panel that turns green, amber or red against the corridor you set. Use it to rehearse a presentation, record a video or podcast, read aloud, practise a language or keep a steady pace on a call.

## ✨ Features

- 🔢 **Live WPM**, updated twice a second over a sliding window (default 15 s).
- ⏸️ **Pauses don't count.** Silence neither lowers the number nor drops it to zero; the value freezes and shows *Pause*.
- 🎯 **Recommended pace per situation and language**: pick *Presentation*, *Conversation*, *Video / podcast*, *Teaching* or *Reading aloud*, and the target corridor adapts to the language you speak. Or set your own. 10 WPM amber bands and a text label make it readable without colour too.
- 🌍 **Six languages**: English, 中文, हिन्दी, Español, العربية and Deutsch, for the interface and for speech recognition, chosen separately. Arabic runs right-to-left.
- 🪟 **Pop-out**: a tiny always-on-top window next to Zoom or your recording app (Chrome, Edge). Safari and Firefox get a small popup.
- 🔁 **Auto-restart** when the browser's recognition times out or the network hiccups, with backoff.
- 📊 **Session summary**: duration, peak, average over speaking time *and* over total duration, time in each zone.
- 🔔 **Optional beep** after 5 s in the red.
- 🌗 **Light and dark** following your system setting.
- 🔗 **Settings in the URL** (`#ui=en&lang=en-US&sc=presentation…`): bookmark a setup, nothing is saved on the device.
- 🧪 **Demo mode** (`?demo=1`): a synthetic 100→200 WPM ramp, no microphone needed.

<div align="center">
<img src="docs/popout-light.png" alt="Pop-out window showing 104 WPM in the corridor" width="240">
&nbsp;&nbsp;
<img src="docs/popout-dark.png" alt="Pop-out window in dark mode" width="240">
</div>

## 🚀 Quick start

1. Open **[nullthrone.github.io/word-pace-track](https://nullthrone.github.io/word-pace-track/)** in Chrome or Safari.
2. Click **Start** and allow the microphone.
3. Speak. A value appears after about 4 s of speech.
4. Optional: click **Pop-out** and put the mini window next to your recording app.

Running it locally:

```bash
git clone https://github.com/nullthrone/word-pace-track.git
cd word-pace-track
npm start   # http://localhost:8000 — the microphone works on localhost and HTTPS only
```

## 🧮 How it measures

The browser's speech recognition (Web Speech API) streams a transcript. Word Pace only counts how much the word count *grows* between updates, stamps each increase with a time, and forgets the words themselves.

```
WPM = words in window / speaking time in window × 60
```

**Speaking time** is the time between word events, with each gap capped at the pause threshold *P* (default 1.5 s, adjustable 0.8–3 s). A gap longer than *P* is a pause: it adds at most *P* and the display freezes. The shown number is smoothed (EMA, factor 0.3).

Good to know:

- While a pause is still inside the window, up to *P* of it counts as speech, so the value can read up to ~10 % low until the pause leaves the window.
- Tools that divide by the *total* duration, pauses included, report a lower number than speaking-time WPM. Switch on **Count pauses** to compare, or read both averages in the session summary.
- Words are counted with `Intl.Segmenter`, so languages written without spaces (Chinese) count dictionary words, not characters.
- Recognition delivers words in bursts with some latency. Accuracy target: within 15 % of a stopwatch count. The [speech bench](bench/README.md) checks this against real German speech in every CI run.

## 🌍 Languages and recommended pace

Good pace depends on the situation and on the language: German and Arabic words are longer than English ones, so the same speed of talking carries fewer words per minute. Word Pace takes a reference corridor in English for each scenario and scales it by a factor for the speech language.

**Scenario corridors (English reference, WPM)**

| Scenario | Corridor | Basis |
| --- | --- | --- |
| Presentation | 140–170 | Lectures average 140–153 WPM, TED talks 169 ([Vuković-Stamatović & Čarapić](http://www.revistaiberica.org/index.php/iberica/article/download/852/549/); [Tånnander & Edlund 2021](https://www.isca-archive.org/ssw_2021/tannander21_ssw.pdf)) |
| Conversation | 150–190 | Telephone corpora 193–196 WPM over total time, by topic 152–170 ([Yuan, Liberman & Cieri 2006](https://www.ldc.upenn.edu/sites/default/files/interspeech2006-towards-integrated-understanding.pdf)); ~150 as US average ([NCVS](https://ncvs.org/archive/ncvs/tutorials/voiceprod/tutorial/quality.html)) |
| Video / podcast | 150–180 | Science podcasts average 168, radio 160 ([Vuković-Stamatović & Čarapić](http://www.revistaiberica.org/index.php/iberica/article/download/852/549/)) |
| Teaching | 120–150 | Learner comprehension improves when speech slows from ~200 to ~130; ~120 for beginners ([Yurtbaşı 2015](https://files.eric.ed.gov/fulltext/ED566202.pdf)) |
| Reading aloud | 140–170 | Audiobook narration ~155 WPM (9,300 words/hour, [ACX](https://help.acx.com/s/article/how-long-will-my-narrated-audiobook-be)); audiobooks 140–180 ([Brysbaert 2019](https://www.gwern.net/doc/psychology/linguistics/2019-brysbaert.pdf)) |

**Language factors (English = 1.0)**, from read-aloud rates in [IReST 2012](https://iovs.arvojournals.org/article.aspx?articleid=2166061) and [Brysbaert 2019](https://www.gwern.net/doc/psychology/linguistics/2019-brysbaert.pdf), averaged:

| Speech language | Factor | Presentation corridor | Confidence |
| --- | --- | --- | --- |
| English (en-US) | 1.00 | 140–170 | reference |
| Español (es-ES) | 0.98 | 135–165 | medium-high |
| Deutsch (de-DE) | 0.84 | 120–145 | medium |
| 中文 (zh-CN) | 0.72 | 100–120 | medium; matches conversational data ([Yuan et al. 2006](https://www.ldc.upenn.edu/sites/default/files/interspeech2006-towards-integrated-understanding.pdf)) |
| العربية (ar-SA) | 0.68 | 95–115 | medium-low |
| हिन्दी (hi-IN) | 1.00 | 140–170 | **low**: one older study, 198 WPM reading aloud ([cited in Dhakal et al. 2015](https://www.languageinindia.com/nov2015/shantarateofspeech1.pdf)) |

Caveats, honestly stated:

- The corridors are a synthesis of the cited measurements, not an official standard.
- The language factors come from read-aloud studies. For spontaneous speech only Chinese has a cross-check, and it agrees.
- Published rates mostly divide by total time. Word Pace excludes only pauses longer than *P*, so it reads close to those figures for fluent speech and higher with many long pauses: about 5 % on parliament speeches, 17 % on a talk with 3 s pauses between paragraphs ([speech bench](bench/README.md#-findings-chrome-156-de-de-october-2026)).
- Hindi needs better data. If you know a study, please open an issue.

<div align="center">
<img src="docs/screenshot-ar.png" alt="Word Pace in Arabic, laid out right-to-left" width="420">
</div>

## 🔒 Privacy

- No audio, transcript or word list is stored. The buffer holds only timestamps and counts.
- No `localStorage`, cookies or IndexedDB. No analytics, no fonts or scripts from third parties.
- A Content-Security-Policy (`connect-src 'none'`) stops the page itself from sending data anywhere.
- ⚠️ **The browser's speech service is the exception.** Chrome sends audio to Google, Safari to Apple. The page cannot change that. If your content is confidential, practise with neutral text.

## 🌐 Browser support

| Browser | Live WPM | Pop-out |
| --- | --- | --- |
| Chrome / Edge (desktop) | ✅ | ✅ always on top (Document Picture-in-Picture) |
| Safari (macOS) | ✅ | ☑️ small popup, not always on top |
| Firefox | ❌ no Web Speech API (demo mode works) | ☑️ popup |

Keep the main tab open; the pop-out only mirrors it.

## ⚙️ Settings

All settings live in the URL fragment, so a bookmark keeps them:

| Key | Meaning | Default | Range |
| --- | --- | --- | --- |
| `ui` | Interface language | from your browser, else `en` | `en`, `zh`, `hi`, `es`, `ar`, `de` |
| `lang` | Speech language | matches `ui` | `en-US`, `zh-CN`, `hi-IN`, `es-ES`, `ar-SA`, `de-DE` |
| `sc` | Scenario | `presentation` | `presentation`, `conversation`, `recording`, `teaching`, `reading`, `custom` |
| `min` / `max` | Target corridor in WPM (used with `sc=custom`) | from scenario | 40–250 / 50–300 |
| `w` | Window length in seconds | 15 | 10–30 |
| `p` | Pause threshold in seconds | 1.5 | 0.8–3 |
| `pauses` | Count pauses (total-duration mode) | 0 | 0 / 1 |
| `beep` | Beep after 5 s in the red | 0 | 0 / 1 |

Examples: `…/word-pace-track/#ui=de&lang=en-US&sc=teaching` (German interface, practising English for learners), `…/word-pace-track/#sc=custom&min=120&max=140`

## 🛠️ Development

Everything is in [`index.html`](index.html): inline CSS (Nullthrone design tokens) and two scripts. The pure counting and window logic sits in `<script id="wpt-core">` without DOM access, so the tests load it on its own.

```bash
npm test                 # unit tests and the speech bench gate (node:test, no dependencies)
npm run bench            # speech bench results per clip
npm run test:browser     # demo mode in headless Chromium (needs playwright)
```

## 🚢 Deployment

Every push to `main` runs the tests and publishes `index.html` to **GitHub Pages** via [`.github/workflows/pages.yml`](.github/workflows/pages.yml). One-time setup: *Settings → Pages → Source: GitHub Actions*.

GitHub Pages cannot set custom response headers. The Content-Security-Policy and referrer policy therefore ship as `<meta>` tags; `Permissions-Policy` has no meta equivalent and is not set.

## 🤝 Contributing

Ideas, measurement reports, translation fixes from native speakers and pull requests are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md); it lists the few promises the project keeps (one file, no data leaves the page).

## ☕ Support

If Word Pace saved you a re-recording, you can buy me a coffee:

<a href="https://ko-fi.com/tsprock"><img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="Support tsprock on Ko-fi" height="36"></a>

## 📜 License

[MIT](LICENSE) © Nullthrone

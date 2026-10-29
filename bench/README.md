# 🧪 Speech bench

Checks Word Pace against real speech before a release. Unit tests prove the arithmetic; the bench proves that what a speaker *sees* matches how fast they actually spoke.

## 🧭 How it works

```
audio with known text ──► Google Chrome speech recognition ──► trace (every onresult event)
   bench/build_audio.py        bench/record.mjs                     tests/speech/<id>.json
                                                                           │
                         npm test ◄── replay through wpt-core ◄────────────┘
```

1. **Audio with ground truth.** `build_audio.py` assembles clips from
   - **real speeches**: German speeches from the European Parliament ([VoxPopuli](https://huggingface.co/datasets/facebook/voxpopuli), CC0), consecutive segments of one speaker with their human transcripts, joined with a fixed pause pattern (0.4–3 s);
   - **synthetic speech**: [Piper](https://github.com/OHF-Voice/piper1-gpl) TTS reading [`texts/de-presentation.txt`](texts/de-presentation.txt) at several rates, a 3 s pause between paragraphs.

   For every segment the truth file holds the reference text and where its speech starts and ends in the WAV (leading and trailing silence trimmed by level).
2. **Traces from the real recognizer.** `record.mjs` plays each WAV into a PulseAudio virtual microphone while Google Chrome runs the Web Speech API exactly like the app (continuous, interim results, restart after `end`). Every event is logged with its time. Only the results from `resultIndex` on are stored, which keeps a two-minute trace at 100–300 KB (2.2 MB for all 15 clips).
3. **Replay in CI.** `tests/speech.test.mjs` feeds each trace through `WPTCore.transcriptWords` and `PaceTracker`, the code `index.html` runs, with the app's 500 ms tick. A second tracker gets the truth as evenly spaced word events per segment. Comparing both separates three error sources:

| Metric | Compares | Isolates |
| --- | --- | --- |
| accumulation error | words counted vs. words in the recognizer's final transcript | the app's handling of interim results and restarts |
| count error | words counted vs. reference text | the above plus recognition errors |
| display bias, MAPE | shown value vs. the same formula on perfect input, while speaking | latency and bursts in the live number |
| shown red, red excess | share of speaking time in red; the part of it that perfect input would not show | what the speaker actually experiences |
| WPM total vs. WPM ideal | words / total time vs. the app's speaking-time formula on perfect input | the gap between the app's definition and the published norms |

Traces are recorded once and committed; CI does not need a browser, audio or network for this. Re-record after a Chrome update or when adding clips.

**The gate** (`tests/speech.test.mjs`, part of `npm test`) fails a clip when the app's count is more than 2 % off the recognizer's final transcript, more than 15 % off the reference text, or when the live value deviates from perfect input by more than 5 % (median) or 15 % (mean). Zone metrics are reported, not gated: whether a window lands in red depends on the corridor, not only on the code.

## 📊 Findings (Chrome 156, de-DE, October 2026)

`npm run bench` prints the full table. In short:

1. **The app counted words twice.** Chrome often withdraws the unstable end of an interim result and sends it again. The old `ingestTotal` lowered its base on every withdrawal and counted the regrowth anew: +2.9 %, +5.3 %, +10.3 % and +10.8 % on four of eight parliament speeches, none on clean TTS. Counting only growth past the highest total brings all 15 clips to 0.0 %. Without that fix the gate fails those four clips.
2. **The live value is otherwise accurate.** Against perfect input with the same formula: median bias within ±3.5 %, mean deviation at most 11 %.
3. **The formula reads above the norms.** Speaking-time WPM caps each pause at *P* = 1.5 s; the corridors come from studies that divide by total time. On perfect input the formula reads 4.6 % above words / total time on the parliament speeches and 16.8 % on the TTS clips with 3 s paragraph pauses. With `--set pauseSec=3` the gap shrinks to 0.4 % and 3.7 %.
4. **Real speech is uneven.** Over 15 s windows a speaker averaging 129 WPM ranges from 109 to 172 (10th to 90th percentile). Even with perfect input, speakers whose overall pace is inside the German presentation corridor (120–145) see red for about 20 % of speaking time, 14 % of it "too fast". With `--set pauseSec=3 --set windowSec=30` the app shows "too fast" for 2 % and red for 16 %, now mostly "too slow".

Points 3 and 4 are product decisions (pause threshold, window, corridor width), not bugs; the bench makes their effect measurable with `npm run bench -- --set key=value`.

## 🛠️ Recording

Linux with PulseAudio, ffmpeg, Node 22 and Python 3.

```bash
# Audio and truth (downloads ~1 GB of parquet by row group, ~100 MB of voices)
python3 -m venv bench/.venv
bench/.venv/bin/pip install piper-tts pyarrow fsspec aiohttp requests
bench/.venv/bin/python bench/build_audio.py            # → bench/.cache/<id>.wav, <id>.truth.json

# Traces: Google Chrome, not Chromium (Chromium has no access to Google's speech service)
npm install --no-save playwright@1.63.0
CHROME=/opt/google/chrome/chrome node bench/record.mjs  # → tests/speech/<id>.json, real time

npm run bench                                           # table per clip
npm run bench -- --set pauseSec=3 --set windowSec=30     # the same with other tracker settings
```

`record.mjs` starts PulseAudio if needed and creates a null sink `wpt_bench` whose monitor is the default microphone. Recording runs in real time (~2.5 min per clip). Chrome sends the audio to Google, as it does for every user of the app; the clips are public speeches and our own text.

## ➕ Adding clips

- **Another language:** add speeches to `corpus.json` (VoxPopuli has `en`, `es`, `de` and more; check the language's licence), or a text under `texts/` and a Piper voice. Everything else follows from `lang`.
- **Another source:** anything with a transcript and segment boundaries works. Write `<id>.wav` and `<id>.truth.json` in the same shape and record.

## ⚠️ Limits

- Words within a segment are spread evenly, so the ideal value ignores breaths and short pauses inside a segment. Totals, counts and the total-time WPM are exact.
- The pauses between real segments are set by the bench, not by the speaker.
- The traces come from Chrome on Linux. Safari and Chrome on Android deliver results differently and are not covered.

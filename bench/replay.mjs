// Replays recorded speech recognition traces (tests/speech/*.json) through the app's own counting
// code and compares the result with the truth of each clip. Used by tests/speech.test.mjs and
// bench/report.mjs.
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
export const TICK_MS = 500;

export function loadCore() {
  const html = readFileSync(new URL('index.html', root), 'utf8');
  const context = { URLSearchParams };
  context.globalThis = context;
  vm.runInNewContext(html.match(/<script id="wpt-core">([\s\S]*?)<\/script>/)[1], context);
  return context.WPTCore;
}

export function loadFixtures() {
  const dir = new URL('tests/speech/', root);
  return readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
    .map((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8')));
}

// Truth as word events: each segment's words spread evenly over its voiced span, on the
// recognition clock (the audio started audioOffsetMs after recognition did).
function truthEvents(Core, fx) {
  const events = [];
  for (const seg of fx.segments) {
    const n = Core.countWords(seg.text, fx.lang);
    const step = (seg.endMs - seg.startMs) / n;
    for (let k = 0; k < n; k++) events.push(fx.audioOffsetMs + seg.startMs + (k + 0.5) * step);
  }
  return events;
}

// Runs one fixture. `settings` defaults to the presentation corridor for the clip's language.
export function replay(Core, fx, settings) {
  const corridor = Core.corridorFor('presentation', fx.lang);
  const s = { scenario: 'presentation', lang: fx.lang, min: corridor.min, max: corridor.max, windowSec: 15, pauseSec: 1.5, ...settings };
  const app = new Core.PaceTracker(s, 0);
  const ideal = new Core.PaceTracker(s, 0);
  const truth = truthEvents(Core, fx);
  const end = Math.max(fx.audioOffsetMs + fx.durationMs, fx.events.at(-1).t);

  let results = [], recognized = 0, ev = 0, tw = 0;
  const ticks = [];
  for (let now = TICK_MS; now <= end; now += TICK_MS) {
    for (; ev < fx.events.length && fx.events[ev].t <= now; ev++) {
      const e = fx.events[ev];
      if (e.type === 'start') {
        // A new recognition session starts with an empty transcript, as after the app's restart.
        recognized += Core.transcriptWords(results, fx.lang);
        results = [];
        app.resetBase();
      } else if (e.type === 'result') {
        results = results.slice(0, e.i).concat(e.r.map(([text, isFinal]) => ({ 0: { transcript: text }, isFinal })));
        app.ingestTotal(Core.transcriptWords(results, fx.lang), e.t);
      }
    }
    for (; tw < truth.length && truth[tw] <= now; tw++) ideal.addWords(1, truth[tw]);
    ticks.push({ t: now, app: app.tick(now), ideal: ideal.tick(now) });
  }
  recognized += Core.transcriptWords(results, fx.lang);

  // Display accuracy while the speaker is actually talking and both sides show a value.
  const speaking = ticks.filter((k) => k.app.value != null && k.ideal.value != null && !k.ideal.paused);
  const ratios = speaking.map((k) => k.app.value / k.ideal.value - 1);
  const sorted = [...ratios].sort((a, b) => a - b);
  const same = speaking.filter((k) => k.app.tone === k.ideal.tone).length;
  const falseRed = speaking.filter((k) => k.app.tone === 'danger' && k.ideal.tone !== 'danger').length;
  const red = speaking.filter((k) => k.app.tone === 'danger').length;

  const words = truth.length;
  const spanMs = fx.segments.at(-1).endMs - fx.segments[0].startMs;
  const appSum = app.summary(end), idealSum = ideal.summary(end);
  return {
    id: fx.id, kind: fx.kind, lang: fx.lang, settings: s,
    words,                                         // truth: words in the reference text
    recognized,                                    // words in the final transcript of each session
    counted: appSum.words,                         // words the app counted
    countError: appSum.words / words - 1,          // app vs truth
    accumulationError: appSum.words / recognized - 1, // app vs what the recognizer finally said
    truthWpmTotal: words / spanMs * 60000,         // the definition published norms use
    truthWpmSpeech: idealSum.avgSpeech,            // the app's own definition, on perfect input
    appWpmSpeech: appSum.avgSpeech,
    ticks: speaking.length,
    medianBias: sorted.length ? sorted[sorted.length >> 1] : null,
    mape: ratios.length ? ratios.reduce((a, r) => a + Math.abs(r), 0) / ratios.length : null,
    zoneAgreement: speaking.length ? same / speaking.length : null,
    falseRed: speaking.length ? falseRed / speaking.length : null,
    // What the speaker sees: zone of the true pace by the norms' definition, and time shown in red.
    truthZone: Core.classify(Math.round(words / spanMs * 60000), s.min, s.max),
    redShare: speaking.length ? red / speaking.length : null,
    series: ticks
  };
}

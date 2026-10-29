// Unit tests for the pure logic block (<script id="wpt-core">) in index.html.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const match = html.match(/<script id="wpt-core">([\s\S]*?)<\/script>/);
assert.ok(match, 'core script block not found in index.html');
const context = { URLSearchParams };
context.globalThis = context;
vm.runInNewContext(match[1], context);
const Core = context.WPTCore;

const base = { scenario: 'custom', min: 130, max: 150, windowSec: 15, pauseSec: 1.5 };

// Speak at `wpm` (wpm 0 = silence) from `from` to `to`, interleaving word events with
// 500 ms ticks as the app does. Returns the last snapshot and the number of alarms.
function stream(tracker, from, to, wpm) {
  const interval = wpm ? 60000 / wpm : Infinity;
  let next = from + interval, nextTick = Math.ceil(from / 500) * 500, snap, alarms = 0;
  while (nextTick <= to) {
    if (next <= nextTick) { tracker.addWords(1, next); next += interval; continue; }
    snap = tracker.tick(nextTick);
    if (snap.alarm) alarms++;
    nextTick += 500;
  }
  return { snap, alarms };
}

test('countWords counts words, not punctuation or whitespace', () => {
  assert.equal(Core.countWords(''), 0);
  assert.equal(Core.countWords('   '), 0);
  assert.equal(Core.countWords(' Hallo  Welt\nwie geht es '), 5);
  assert.equal(Core.countWords("Don't stop — it's 2026, really!", 'en-US'), 5);
  assert.equal(Core.countWords(undefined), 0);
});

test('countWords segments languages without spaces', () => {
  // ICU splits this into 我|今天|想|给|大家|介绍|一下|我们|的|新|产品.
  assert.equal(Core.countWords('我今天想给大家介绍一下我们的新产品。', 'zh-CN'), 11);
  assert.equal(Core.countWords('मैं आज आपको हमारे नए उत्पाद के बारे में बताना चाहता हूँ।', 'hi-IN'), 12);
  assert.equal(Core.countWords('أريد اليوم أن أقدّم لكم منتجنا الجديد.', 'ar-SA'), 7);
  assert.equal(Core.countWords('Quiero presentaros hoy nuestro nuevo producto.', 'es-ES'), 6);
});

test('ingestTotal counts growth past the highest total and survives corrections and restarts', () => {
  const tr = new Core.PaceTracker(base, 0);
  assert.equal(tr.ingestTotal(3, 100), 3);
  assert.equal(tr.ingestTotal(5, 200), 2);
  assert.equal(tr.ingestTotal(4, 300), 0, 'correction adds nothing');
  assert.equal(tr.ingestTotal(5, 350), 0, 'words withdrawn and sent again are not counted twice');
  assert.equal(tr.ingestTotal(6, 400), 1, 'only growth past the highest total counts');
  tr.resetBase();
  assert.equal(tr.ingestTotal(2, 500), 2, 'after a restart the transcript starts at 0');
  assert.equal(tr.stats.words, 8);
});

test('steady speech at 150 WPM reads about 150', () => {
  const tr = new Core.PaceTracker(base, 0);
  const { snap } = stream(tr, 0, 30000, 150);
  assert.ok(Math.abs(snap.value - 150) <= 150 * 0.05, `value ${snap.value}`);
  assert.equal(snap.zone, 'ok');
  assert.equal(snap.paused, false);
});

test('no value until 4 s of speech are in the window', () => {
  const tr = new Core.PaceTracker(base, 0);
  const { snap } = stream(tr, 0, 3000, 150);
  assert.equal(snap.value, null);
  assert.equal(snap.hasSpeech, true);
});

test('pauses freeze the value instead of lowering it', () => {
  const tr = new Core.PaceTracker(base, 0);
  const before = stream(tr, 0, 12000, 150).snap;
  assert.ok(Math.abs(before.value - 150) <= 8, `before pause ${before.value}`);

  const during = stream(tr, 12000, 17000, 0).snap;
  assert.equal(during.paused, true);
  assert.ok(Math.abs(during.value - before.value) <= 2, `during ${during.value}, before ${before.value}`);

  // While the pause is inside the window, up to P of it counts as speech (spec formula), so the
  // value reads a little low; once the pause has left the 15 s window it is back on target.
  const after = stream(tr, 17000, 33000, 150).snap;
  assert.equal(after.paused, false);
  assert.ok(Math.abs(after.value - 150) <= 8, `after pause ${after.value}`);
});

test('includePauses divides by the window and lets pauses lower the value', () => {
  const plain = new Core.PaceTracker(base, 0);
  const total = new Core.PaceTracker({ ...base, includePauses: true }, 0);
  for (const tr of [plain, total]) {
    stream(tr, 0, 10000, 150);
    stream(tr, 10000, 15000, 0);
  }
  const a = stream(plain, 15000, 20000, 150).snap;
  const b = stream(total, 15000, 20000, 150).snap;
  assert.ok(b.value < a.value - 15, `with pauses ${b.value}, without ${a.value}`);
});

test('acceptance: 150 words with five 5 s pauses average within 15 % of words / pure speech time', () => {
  const tr = new Core.PaceTracker(base, 0);
  const wpm = 140, interval = 60000 / wpm;
  let t = 0, words = 0, speaking = 0;
  for (let block = 0; block < 6; block++) {
    for (let k = 0; k < 25; k++) {
      t += interval;
      tr.addWords(1, t);
      words++;
      speaking += interval;
      if (k % 2 === 0) tr.tick(t);
    }
    if (block < 5) { stream(tr, t, t + 5000, 0); t += 5000; }
  }
  const sum = tr.summary(t);
  const truth = words / speaking * 60000;
  assert.equal(words, 150);
  assert.ok(Math.abs(sum.avgSpeech - truth) / truth < 0.15, `avg ${sum.avgSpeech}, truth ${truth.toFixed(1)}`);
  assert.ok(sum.avgTotal < sum.avgSpeech, 'the total-duration average includes the pauses');
});

test('classify follows the corridor and 10 WPM yellow bands', () => {
  const c = (v) => Core.classify(v, 130, 150);
  assert.equal(c(null), null);
  assert.equal(c(119), 'slow');
  assert.equal(c(120), 'edge-slow');
  assert.equal(c(129), 'edge-slow');
  assert.equal(c(130), 'ok');
  assert.equal(c(150), 'ok');
  assert.equal(c(151), 'edge-fast');
  assert.equal(c(160), 'edge-fast');
  assert.equal(c(161), 'fast');
  assert.equal(Core.toneOf('edge-fast'), 'warn');
  assert.equal(Core.toneOf('slow'), 'danger');
});

test('alarm fires once after more than 5 s in red and re-arms after leaving red', () => {
  const tr = new Core.PaceTracker(base, 0);
  let alarms = stream(tr, 0, 20000, 200).alarms;
  assert.equal(alarms, 1);
  // Slow down into the corridor, then speed up again.
  alarms += stream(tr, 20000, 40000, 140).alarms;
  alarms += stream(tr, 40000, 60000, 200).alarms;
  assert.equal(alarms, 2);
});

test('settings round-trip through the URL fragment and are clamped', () => {
  const s = Core.parseHash('#ui=de&lang=en-US&sc=custom&min=120&max=160&w=20&p=2&pauses=1&beep=1');
  assert.deepEqual({ ...s }, { ui: 'de', lang: 'en-US', scenario: 'custom', min: 120, max: 160, windowSec: 20, pauseSec: 2, includePauses: true, beep: true });
  assert.equal(Core.serializeHash(s), 'ui=de&lang=en-US&sc=custom&min=120&max=160&w=20&p=2&pauses=1&beep=1');

  const d = Core.parseHash('');
  const preset = Core.corridorFor(Core.DEFAULTS.scenario, Core.DEFAULTS.lang);
  assert.deepEqual({ ...d }, { ...Core.DEFAULTS, min: preset.min, max: preset.max });

  const bad = Core.parseHash('#sc=custom&min=abc&max=100&w=99&p=0.1&lang=fr-FR&ui=fr');
  assert.equal(bad.min, 130);
  assert.equal(bad.max, 150, 'max at or below min moves to min + 20');
  assert.equal(bad.windowSec, 30);
  assert.equal(bad.pauseSec, 0.8);
  assert.equal(bad.lang, 'en-US');
  assert.equal(bad.ui, 'en');
  assert.equal(Core.parseHash('#sc=nonsense').scenario, Core.DEFAULTS.scenario);
});

test('a preset scenario sets the corridor from the speech language; custom keeps typed values', () => {
  for (const lang of Core.SPEECH_LANGS) {
    for (const sc of Core.SCENARIOS.filter((x) => x !== 'custom')) {
      const c = Core.corridorFor(sc, lang);
      assert.ok(c.min > 0 && c.max > c.min, `${sc} ${lang}: ${c.min}-${c.max}`);
      assert.equal(c.min % 5, 0);
      const s = Core.parseHash(`#lang=${lang}&sc=${sc}&min=999&max=1`);
      assert.equal(s.min, c.min, 'preset ignores typed min');
      assert.equal(s.max, c.max, 'preset ignores typed max');
    }
  }
  assert.deepEqual({ ...Core.corridorFor('presentation', 'en-US') },
    { min: Core.SCENARIO_BASE.presentation[0], max: Core.SCENARIO_BASE.presentation[1] }, 'English is the reference');
  assert.equal(Core.corridorFor('custom', 'en-US'), null);
  const custom = Core.parseHash('#sc=custom&min=100&max=125');
  assert.equal(custom.min, 100);
  assert.equal(custom.max, 125);
});

test('the gauge scale frames the corridor', () => {
  assert.deepEqual({ ...Core.scaleFor(130, 150) }, { from: 80, to: 220 });
  assert.deepEqual({ ...Core.scaleFor(45, 60) }, { from: 0, to: 130 });
  const sc = Core.scaleFor(130, 150);
  assert.equal(Core.scalePercent(80, sc), 0);
  assert.equal(Core.scalePercent(150, sc), 50);
  assert.equal(Core.scalePercent(500, sc), 100);
});

test('interface language follows the browser, with English as fallback', () => {
  assert.equal(Core.pickUiLang(['fr-FR', 'de-AT', 'en']), 'de');
  assert.equal(Core.pickUiLang(['zh-TW']), 'zh');
  assert.equal(Core.pickUiLang(['fr-FR']), 'en');
  assert.equal(Core.pickUiLang([]), 'en');
  const d = Core.defaultsFor(['es-MX']);
  assert.equal(d.ui, 'es');
  assert.equal(d.lang, 'es-ES');
  assert.equal(Core.parseHash('', d).ui, 'es');
  assert.equal(Core.isRtl('ar'), true);
  assert.equal(Core.isRtl('de'), false);
});

test('every interface language translates every string', () => {
  const keys = Object.keys(Core.STRINGS.en).sort();
  const placeholders = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
  for (const ui of Core.UI_LANGS) {
    const table = Core.STRINGS[ui];
    assert.ok(table, `missing table ${ui}`);
    assert.deepEqual(Object.keys(table).sort(), keys, `keys differ for ${ui}`);
    for (const k of keys) assert.equal(placeholders(table[k]), placeholders(Core.STRINGS.en[k]), `${ui}.${k} placeholders`);
    assert.ok(Core.LANG_NAMES[ui], `language name ${ui}`);
  }
  assert.equal(Core.t('de', 'errRepeated', { n: 5, code: 'network' }),
    'Die Spracherkennung ist 5-mal in Folge fehlgeschlagen (network). Prüfe die Netzwerkverbindung und starte erneut.');
  assert.equal(Core.t('xx', 'start'), 'Start', 'unknown language falls back to English');
  assert.equal(Core.t('de', 'noSuchKey'), 'noSuchKey');
});

test('demo source ramps from 100 to 200 WPM over 60 s', () => {
  assert.equal(Core.DemoSource.rateAt(0), 100);
  assert.equal(Core.DemoSource.rateAt(30000), 150);
  assert.equal(Core.DemoSource.rateAt(60000), 100, 'the ramp repeats');
  const src = new Core.DemoSource(0);
  let words = 0;
  for (let t = 500; t <= 60000; t += 500) words += src.pull(t);
  assert.ok(Math.abs(words - 150) <= 2, `words in first minute ${words}`);
});

// Release gate against real speech: replays recorded Chrome recognition traces (tests/speech/*.json)
// through wpt-core and checks the result against each clip's truth. See bench/README.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore, loadFixtures, replay } from '../bench/replay.mjs';

const Core = loadCore();
const fixtures = loadFixtures();

// Tolerances. The README promises "within 15 % of a stopwatch count".
const MAX_ACCUMULATION_ERROR = 0.03;   // app vs the recognizer's own final transcript
const MAX_COUNT_ERROR = 0.10;          // app vs the reference text, recognition errors included
const MAX_DISPLAY_BIAS = 0.10;         // live value vs the same formula on perfect input
const MAX_MAPE = 0.15;
const MAX_RED_IN_CORRIDOR = 0.10;      // share of speaking time shown red although the true pace is in the corridor

const pct = (v) => `${(v * 100).toFixed(1)} %`;

test('speech fixtures are present', () => {
  assert.ok(fixtures.length >= 8, `found ${fixtures.length}`);
  for (const fx of fixtures) assert.ok(fx.events.some((e) => e.type === 'result'), `${fx.id} has no results`);
});

for (const fx of fixtures) {
  test(`speech: ${fx.id}`, () => {
    const r = replay(Core, fx);
    assert.ok(Math.abs(r.accumulationError) <= MAX_ACCUMULATION_ERROR,
      `counted ${r.counted} words, the recognizer's final transcript has ${r.recognized} (${pct(r.accumulationError)})`);
    assert.ok(Math.abs(r.countError) <= MAX_COUNT_ERROR,
      `counted ${r.counted} words, the reference text has ${r.words} (${pct(r.countError)})`);
    assert.ok(Math.abs(r.medianBias) <= MAX_DISPLAY_BIAS, `median display bias ${pct(r.medianBias)}`);
    assert.ok(r.mape <= MAX_MAPE, `display MAPE ${pct(r.mape)}`);
    if (r.truthZone === 'ok') {
      assert.ok(r.redShare <= MAX_RED_IN_CORRIDOR,
        `true pace ${Math.round(r.truthWpmTotal)} WPM is inside ${r.settings.min}–${r.settings.max}, yet red for ${pct(r.redShare)} of speaking time`);
    }
  });
}

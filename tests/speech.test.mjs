// Release gate against real speech: replays recorded Chrome recognition traces (tests/speech/*.json)
// through wpt-core and checks the result against each clip's truth. See bench/README.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore, loadFixtures, replay } from '../bench/replay.mjs';

const Core = loadCore();
const fixtures = loadFixtures();

const MAX_ACCUMULATION_ERROR = 0.02;   // app vs the recognizer's own final transcript
const MAX_COUNT_ERROR = 0.15;          // app vs the reference text; the README promises 15 %
const MAX_DISPLAY_BIAS = 0.05;         // live value vs the same formula on perfect input, median
const MAX_MAPE = 0.15;                 // the same, mean absolute deviation

const pct = (v) => `${(v * 100).toFixed(1)} %`;

test('speech fixtures are present', () => {
  assert.ok(fixtures.length >= 15, `found ${fixtures.length}`);
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
  });
}

// Prints the speech bench results per clip. Usage: node bench/report.mjs [--csv]
import { loadCore, loadFixtures, replay } from './replay.mjs';

const Core = loadCore();
const rows = loadFixtures().map((fx) => replay(Core, fx));
const pct = (v) => v == null ? '–' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)} %`;
const share = (v) => v == null ? '–' : `${Math.round(v * 100)} %`;
const cols = [
  ['clip', (r) => r.id],
  ['words', (r) => r.words],
  ['recognized', (r) => r.recognized],
  ['counted', (r) => r.counted],
  ['count err', (r) => pct(r.countError)],
  ['accum. err', (r) => pct(r.accumulationError)],
  ['WPM total', (r) => Math.round(r.truthWpmTotal)],
  ['WPM ideal', (r) => r.truthWpmSpeech],
  ['WPM app', (r) => r.appWpmSpeech],
  ['bias', (r) => pct(r.medianBias)],
  ['MAPE', (r) => share(r.mape)],
  ['zone match', (r) => share(r.zoneAgreement)],
  ['false red', (r) => share(r.falseRed)],
  ['true zone', (r) => r.truthZone],
  ['shown red', (r) => share(r.redShare)]
];
const table = rows.map((r) => cols.map(([, f]) => String(f(r))));
if (process.argv.includes('--csv')) {
  console.log(cols.map(([h]) => h).join(','));
  for (const row of table) console.log(row.join(','));
} else {
  const widths = cols.map(([h], i) => Math.max(h.length, ...table.map((row) => row[i].length)));
  const line = (cells) => '| ' + cells.map((c, i) => c.padEnd(widths[i])).join(' | ') + ' |';
  console.log(line(cols.map(([h]) => h)));
  console.log('| ' + widths.map((w) => '-'.repeat(w)).join(' | ') + ' |');
  for (const row of table) console.log(line(row));
}

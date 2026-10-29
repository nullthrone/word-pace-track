// Plays each bench clip into a virtual microphone, records what Google Chrome's speech recognition
// emits and writes it with the clip's truth to tests/speech/<id>.json for replay in `npm test`.
//
// Usage: node bench/record.mjs [--only id,id] [--cache bench/.cache] [--truth-only]
// --truth-only copies changed truth files into the recorded fixtures without recording again.
// Needs Google Chrome (CHROME=/path/to/chrome; Chromium has no access to Google's speech service),
// PulseAudio with pactl and paplay, and the clips from bench/build_audio.py. See bench/README.md.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const here = fileURLToPath(new URL('.', import.meta.url));
const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const cache = opt('--cache', join(here, '.cache'));
const only = new Set(opt('--only', '').split(',').filter(Boolean));
const chrome = process.env.CHROME || '/opt/google/chrome/chrome';
const out = join(here, '..', 'tests', 'speech');
const SINK = 'wpt_bench';
const TAIL_MS = 4000;

// A null sink whose monitor is the default microphone: whatever paplay plays into it, Chrome hears.
function setupPulse() {
  try { execFileSync('pactl', ['info'], { stdio: 'ignore' }); } catch {
    execFileSync('pulseaudio', ['-D', '--exit-idle-time=-1']);
  }
  const sinks = execFileSync('pactl', ['list', 'short', 'sinks'], { encoding: 'utf8' });
  if (!sinks.includes(SINK)) {
    execFileSync('pactl', ['load-module', 'module-null-sink', `sink_name=${SINK}`]);
    execFileSync('pactl', ['load-module', 'module-virtual-source', `source_name=${SINK}_mic`, `master=${SINK}.monitor`]);
  }
  execFileSync('pactl', ['set-default-source', `${SINK}_mic`]);
}

const ids = readdirSync(cache).filter((f) => f.endsWith('.truth.json')).map((f) => f.slice(0, -11))
  .filter((id) => !only.size || only.has(id)).sort();
const readTruth = (id) => JSON.parse(readFileSync(join(cache, id + '.truth.json'), 'utf8'));

if (args.includes('--truth-only')) {
  for (const id of ids) {
    const file = join(out, id + '.json');
    if (!existsSync(file)) continue;
    const { recorder, audioOffsetMs, events } = JSON.parse(readFileSync(file, 'utf8'));
    writeFileSync(file, JSON.stringify({ ...readTruth(id), recorder, audioOffsetMs, events }) + '\n');
    console.log(`${id}: truth updated`);
  }
  process.exit(0);
}

const page = readFileSync(join(here, 'capture.html'));
const server = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(page); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

setupPulse();
const browser = await chromium.launch({ executablePath: chrome, args: ['--use-fake-ui-for-media-stream'] });
try {
  for (const id of ids) {
    const truth = readTruth(id);
    const context = await browser.newContext({ permissions: ['microphone'] });
    const tab = await context.newPage();
    await tab.goto(url);
    if (!await tab.evaluate(() => window.bench.supported)) throw new Error('no SpeechRecognition in this browser');
    await tab.evaluate((lang) => window.bench.start(lang), truth.lang);
    await tab.waitForFunction(() => window.bench.log().some((e) => e.type === 'start'), null, { timeout: 10000 });

    const audioOffsetMs = await tab.evaluate(() => window.bench.now());
    const player = spawn('paplay', ['-d', SINK, '--latency-msec=20', join(cache, id + '.wav')], { stdio: 'inherit' });
    await new Promise((resolve, reject) => player.on('exit', (code) => code ? reject(new Error(`paplay exited ${code}`)) : resolve()));
    await tab.waitForTimeout(TAIL_MS);
    await tab.evaluate(() => window.bench.stop());
    await tab.waitForFunction(() => window.bench.log().at(-1).type === 'end', null, { timeout: 10000 }).catch(() => {});
    const events = await tab.evaluate(() => window.bench.log());
    await context.close();

    const errors = events.filter((e) => e.type === 'error').map((e) => e.error);
    const fixture = { ...truth, recorder: { browser: `Chrome ${browser.version()}`, recordedAt: new Date().toISOString().slice(0, 10) }, audioOffsetMs, events };
    writeFileSync(join(out, id + '.json'), JSON.stringify(fixture) + '\n');
    console.log(`${id}: ${events.length} events${errors.length ? `, errors: ${errors.join(' ')}` : ''}`);
  }
} finally {
  await browser.close();
  server.close();
}

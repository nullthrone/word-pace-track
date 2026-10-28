// Browser smoke test: serves the repo, runs ?demo=1 in Chromium and checks the live display.
// Usage: node tests/smoke.mjs [screenshot-dir]
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const shots = process.argv[2];

const html = readFileSync(new URL('../index.html', import.meta.url));
const server = createServer((req, res) => {
  if (req.url.split('?')[0] === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  } else {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const runs = [
  { colorScheme: 'light', locale: 'en-US', ui: 'en', dir: 'ltr', shots: true },
  { colorScheme: 'dark', locale: 'en-US', ui: 'en', dir: 'ltr', shots: true },
  { colorScheme: 'light', locale: 'de-DE', ui: 'de', dir: 'ltr' },
  { colorScheme: 'light', locale: 'ar-SA', ui: 'ar', dir: 'rtl', shots: true }
];

const browser = await chromium.launch();
try {
  for (const run of runs) {
    const name = `${run.ui}-${run.colorScheme}`;
    const context = await browser.newContext({ colorScheme: run.colorScheme, locale: run.locale, viewport: { width: 560, height: 1200 } });
    const page = await context.newPage();
    const requests = [];
    const problems = [];
    page.on('request', (r) => requests.push(r.url()));
    page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
    page.on('pageerror', (e) => problems.push(e.message));

    await page.goto(base + '?demo=1');
    assert.equal(await page.getAttribute('html', 'data-theme'), run.colorScheme);
    assert.equal(await page.getAttribute('html', 'lang'), run.ui, 'interface follows the browser language');
    assert.equal(await page.getAttribute('html', 'dir'), run.dir);
    assert.match(page.url(), new RegExp(`#ui=${run.ui}&lang=[a-z]{2}-[A-Z]{2}&sc=presentation&min=\\d+&max=\\d+&w=15&p=1\\.5&pauses=0&beep=0$`));
    const t = (key) => page.evaluate((k) => window.WPTCore.t(document.documentElement.lang, k), key);
    assert.equal(await page.textContent('#start'), await t('start'));

    await page.click('#start');
    await page.waitForTimeout(7000);
    const value = Number(await page.textContent('#wpm'));
    assert.ok(value >= 95 && value <= 125, `demo value after 7 s: ${value}`);
    const expected = await page.evaluate((v) => {
      const C = window.WPTCore;
      const s = C.parseHash(location.hash);
      const zone = C.classify(v, s.min, s.max);
      return { tone: C.toneOf(zone), label: C.t(s.ui, C.zoneKey(zone)) };
    }, value);
    assert.equal(await page.getAttribute('#readout', 'data-tone'), expected.tone);
    assert.equal(await page.textContent('#zone-label'), expected.label);
    assert.equal(await page.isVisible('#gauge-marker'), true);
    if (shots && run.shots) {
      await page.screenshot({ path: `${shots}/running-${name}.png`, fullPage: true });
      await page.locator('main .card').first().screenshot({ path: `${shots}/readout-${name}.png` });
    }

    // Typing a corridor switches the scenario to custom and flows into the URL and the gauge.
    await page.fill('#set-min', '90');
    await page.press('#set-min', 'Enter');
    await page.fill('#set-max', '120');
    await page.press('#set-max', 'Enter');
    await page.locator('#set-max').blur();
    await page.waitForTimeout(600);
    assert.equal(await page.inputValue('#set-scenario'), 'custom');
    assert.match(page.url(), /sc=custom&min=90&max=120/);
    assert.equal(await page.getAttribute('#readout', 'data-tone'), 'ok');

    // Switching the interface language re-labels the page without a reload.
    await page.selectOption('#set-ui', 'es');
    assert.equal(await page.textContent('#start'), 'Detener');
    await page.selectOption('#set-ui', run.ui);

    // Pop-out: Document PiP where available, else a popup window.
    const popupPromise = context.waitForEvent('page', { timeout: 3000 }).catch(() => null);
    await page.click('#popout');
    const popup = await popupPromise;
    const mode = await page.evaluate(() => ('documentPictureInPicture' in window ? 'pip' : 'popup'));
    if (popup) {
      await page.waitForTimeout(1200);
      const miniValue = await popup.textContent('.mini-wpm');
      assert.equal(miniValue, await page.textContent('#wpm'));
      assert.equal(await popup.getAttribute('html', 'dir'), run.dir);
      if (shots && run.shots) {
        await popup.setViewportSize({ width: 240, height: 140 });
        await popup.screenshot({ path: `${shots}/mini-${name}.png` });
      }
      console.log(`${name}: pop-out (${mode}) mirrors the value ${miniValue}`);
    } else {
      console.log(`${name}: pop-out (${mode}) not visible to Playwright; label "${await page.textContent('#popout')}"`);
    }

    await page.click('#start');
    assert.equal(await page.isVisible('#stats'), true);
    if (shots && run.shots) await page.screenshot({ path: `${shots}/stopped-${name}.png`, fullPage: true });

    const own = requests.filter((u) => !u.startsWith('data:') && u !== 'about:blank');
    assert.deepEqual(own, [base + '?demo=1'], `requests: ${own.join(', ')}`);
    assert.deepEqual(problems, [], 'console errors or CSP violations');
    console.log(`${name}: value ${value}, requests ${own.length}, ok`);
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}

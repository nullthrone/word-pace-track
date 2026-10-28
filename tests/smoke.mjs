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

const browser = await chromium.launch();
try {
  for (const colorScheme of ['light', 'dark']) {
    const context = await browser.newContext({ colorScheme, viewport: { width: 560, height: 1100 } });
    const page = await context.newPage();
    const requests = [];
    const problems = [];
    page.on('request', (r) => requests.push(r.url()));
    page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
    page.on('pageerror', (e) => problems.push(e.message));

    await page.goto(base + '?demo=1');
    assert.equal(await page.getAttribute('html', 'data-theme'), colorScheme);
    assert.match(page.url(), /#min=130&max=150&w=15&p=1\.5&lang=de-DE&pauses=0&beep=0$/);

    await page.click('#start');
    await page.waitForTimeout(7000);
    const value = Number(await page.textContent('#wpm'));
    assert.ok(value >= 95 && value <= 125, `demo value after 7 s: ${value}`);
    assert.equal(await page.getAttribute('#readout', 'data-tone'), 'danger');
    assert.match(await page.textContent('#zone-label'), /Zu langsam/);
    assert.equal(await page.isVisible('#gauge-marker'), true);
    if (shots) {
      await page.screenshot({ path: `${shots}/running-${colorScheme}.png`, fullPage: true });
      await page.locator('main .card').first().screenshot({ path: `${shots}/readout-${colorScheme}.png` });
    }

    // Settings flow into the URL fragment and the gauge.
    await page.fill('#set-min', '90');
    await page.fill('#set-max', '120');
    await page.press('#set-max', 'Enter');
    await page.locator('#set-max').blur();
    await page.waitForTimeout(600);
    assert.match(page.url(), /min=90&max=120/);
    assert.equal(await page.getAttribute('#readout', 'data-tone'), 'ok');

    // Pop-out: Document PiP where available, else a popup window.
    const popupPromise = context.waitForEvent('page', { timeout: 3000 }).catch(() => null);
    await page.click('#popout');
    const popup = await popupPromise;
    const mode = await page.evaluate(() => ('documentPictureInPicture' in window ? 'pip' : 'popup'));
    if (popup) {
      await page.waitForTimeout(1200);
      const miniValue = await popup.textContent('.mini-wpm');
      assert.equal(miniValue, await page.textContent('#wpm'));
      if (shots) {
        await popup.setViewportSize({ width: 240, height: 140 });
        await popup.screenshot({ path: `${shots}/mini-${colorScheme}.png` });
      }
      console.log(`pop-out (${mode}) mirrors the value: ${miniValue}`);
    } else {
      console.log(`pop-out (${mode}): no new page visible to Playwright; label is "${await page.textContent('#popout')}"`);
    }

    await page.click('#start');
    assert.equal(await page.isVisible('#stats'), true);
    if (shots) await page.screenshot({ path: `${shots}/stopped-${colorScheme}.png`, fullPage: true });

    const own = requests.filter((u) => !u.startsWith('data:') && u !== 'about:blank');
    assert.deepEqual(own, [base + '?demo=1'], `requests: ${own.join(', ')}`);
    assert.deepEqual(problems, [], 'console errors or CSP violations');
    console.log(`${colorScheme}: value ${value}, requests ${own.length}, ok`);
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}

// Быстрый скриншот страницы в headless Chromium: node tools/shot.mjs URL OUT.png [ждать_мс] [js-выражение]
import puppeteer from 'puppeteer-core';
const [url, out, wait = 4000, expr] = process.argv.slice(2);
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || '/snap/bin/chromium', headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto(url, { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, Number(wait)));
if (expr) console.log('eval:', JSON.stringify(await page.evaluate(expr)));
await page.screenshot({ path: out });
console.log(errors.length ? errors.join('\n') : 'консоль чистая');
await browser.close();

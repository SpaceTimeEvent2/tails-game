// Кадры всех клипов персонажа (нужен статический сервер на корне проекта, напр. python3 -m http.server 8797):
//   node tools/anim-shots.mjs "http://127.0.0.1:8797/tools/anim-preview.html?frames=7" ~/tails-shots/anim.png
import puppeteer from 'puppeteer-core';
const [url, out, h = 1400] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: '/snap/bin/chromium', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 1050, height: Number(h) });
p.on('pageerror', (e) => console.log('ERR', e.message)); p.on('console', (m) => m.type() === 'error' && console.log('ERR', m.text()));
await p.goto(url); await p.waitForFunction(() => document.title === 'done', { timeout: 120000 });
await p.screenshot({ path: out, fullPage: true }); await b.close();

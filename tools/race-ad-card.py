#!/usr/bin/env python3
"""Концовка ролика о гонке: QR и ссылка в безопасной зоне Shorts. Запуск: python3 tools/race-ad-card.py кадр.png"""
import base64, io, json, os, subprocess, sys, tempfile
import qrcode

URL = 'https://spacecode.business/tails/'
OUT = os.path.abspath(sys.argv[1])
q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=16, border=3)
q.add_data(URL); q.make(fit=True)
b = io.BytesIO(); q.make_image(fill_color='#0b0d2c', back_color='white').save(b, 'PNG')
img = 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()
pre = 'data:image/jpeg;base64,' + base64.b64encode(open('assets/preview-race.jpg', 'rb').read()).decode()
html = f'''<!doctype html><meta charset=utf-8><style>
*{{box-sizing:border-box}}html,body{{margin:0;width:1080px;height:1920px;overflow:hidden}}
body{{display:flex;flex-direction:column;align-items:center;padding-top:230px;color:#fff;font-family:"Segoe UI",system-ui,sans-serif;background:#05061a url("{pre}") center/cover}}
body::before{{content:"";position:fixed;inset:0;background:linear-gradient(180deg,#05061ae8,#05061ad0 55%,#05061af2)}}
body>*{{position:relative}}
h1{{margin:0;font-size:136px;font-weight:900;line-height:1.05;background:linear-gradient(180deg,#fff3bd,#ffd447);-webkit-background-clip:text;background-clip:text;color:transparent}}
.s{{font-size:62px;font-weight:800;margin:6px 0 44px}}
img{{width:620px;height:620px;image-rendering:pixelated;border-radius:34px;display:block;box-shadow:0 0 90px #6fe3ff88}}
.u{{margin-top:44px;padding:18px 40px;border-radius:999px;background:#ffd447;color:#2a1f00;font-size:56px;font-weight:900}}
.t{{margin-top:22px;font-size:40px;color:#d5e4ff;font-weight:700}}
</style><h1>Хвосты</h1><div class=s>🚀 Космическая гонка</div><img src="{img}"><div class=u>spacecode.business/tails</div><div class=t>Наведи камеру на код</div>'''
tmp = tempfile.mkdtemp(); f = os.path.join(tmp, 'c.html'); open(f, 'w', encoding='utf-8').write(html)
js = f"""import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({{executablePath:'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox']}});const p=await b.newPage();
await p.setViewport({{width:1080,height:1920}});await p.goto({json.dumps('file://'+f)});await new Promise(r=>setTimeout(r,300));await p.screenshot({{path:{json.dumps(OUT)}}});await b.close();"""
j = os.path.join(os.getcwd(), 'tools', '.race-card.mjs'); open(j, 'w').write(js)
try: subprocess.run(['node', j], check=True)
finally: os.remove(j)
print('кадр:', OUT)

#!/usr/bin/env python3
"""Концовка ролика: неподвижный кадр с двумя QR-кодами. Запуск: python3 tools/howto-qr.py кадр.png"""
import base64, io, json, subprocess, sys, tempfile, os
import qrcode

PLAY = 'https://play.google.com/store/apps/details?id=business.spacecode.tails'
SITE = 'https://spacecode.business/tails/'
OUT = os.path.abspath(sys.argv[1])
VERT = len(sys.argv) > 2 and sys.argv[2] == "vert"
W, H = (720, 1280) if VERT else (1280, 720)
LEAD = sys.argv[3] if len(sys.argv) > 3 else ""

def qr(url):
    q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=12, border=3)
    q.add_data(url); q.make(fit=True)
    b = io.BytesIO(); q.make_image(fill_color='#06192b', back_color='white').save(b, 'PNG')
    return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()

html = f'''<!doctype html><meta charset=utf-8><style>
*{{box-sizing:border-box}}html,body{{margin:0;width:{W}px;height:{H}px;overflow:hidden}}
body{{display:grid;grid-template-rows:auto 1fr;justify-items:center;padding:34px 60px 40px;color:#fff;font-family:"Segoe UI",system-ui,sans-serif;
 background:radial-gradient(70% 60% at 85% -10%,#ffd44733,transparent 70%),radial-gradient(60% 60% at 5% 110%,#ff6f9133,transparent 70%),radial-gradient(120% 90% at 50% 0%,#1b5b7e 0%,#0a2740 45%,#061a2b 100%)}}
h1{{margin:0;font-size:64px;font-weight:900;line-height:1.1;background:linear-gradient(180deg,#fff3bd,#ffd447);-webkit-background-clip:text;background-clip:text;color:transparent}}
.row{{display:grid;grid-template-columns:1fr 1fr;gap:64px;align-self:center;width:100%;max-width:1000px}}
.c{{display:grid;justify-items:center;gap:14px}}
.c img{{width:400px;height:400px;image-rendering:pixelated;border-radius:22px;background:#fff;box-shadow:0 18px 44px #04121ea8;display:block}}
.c b{{font-size:34px;font-weight:800}}.c span{{font-size:21px;color:#cfe6f0}}
{'.row{grid-template-columns:1fr;gap:30px;justify-items:center}.c img{width:400px;height:400px}h1{font-size:86px}body{padding:60px 30px 40px}' if VERT else ''}
.lead{{font-size:{'40' if VERT else '30'}px;font-weight:800;margin-top:6px;color:#fff}}
</style><div style="display:grid;justify-items:center"><h1>Хвосты</h1>{f'<div class=lead>{LEAD}</div>' if LEAD else ''}</div><div class=row>
<div class=c><img src="{qr(PLAY)}"><b>▶ Google Play</b><span>Установить на телефон</span></div>
<div class=c><img src="{qr(SITE)}"><b>🌐 Сайт игры</b><span>spacecode.business/tails</span></div></div>'''
tmp = tempfile.mkdtemp(); f = os.path.join(tmp, 'c.html'); open(f, 'w', encoding='utf-8').write(html)
js = f"""import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({{executablePath:'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox']}});const p=await b.newPage();
await p.setViewport({{width:{W},height:{H}}});await p.goto({json.dumps('file://'+f)});await new Promise(r=>setTimeout(r,300));await p.screenshot({{path:{json.dumps(OUT)}}});await b.close();"""
j = os.path.join(os.getcwd(), 'tools', '.qr-shot.mjs'); open(j, 'w').write(js)
try: subprocess.run(['node', j], check=True)
finally: os.remove(j)
print('кадр:', OUT)

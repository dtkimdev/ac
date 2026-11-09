#!/usr/bin/env node
// Final v9 preview shots from the staged build (bin/v9-stage.sh): shots/v9-{faces,harbor,monitors,night}.png
'use strict';
const path = require('path'), fs = require('fs'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), { chromium } = require(path.join(ROOT, 'node_modules', 'playwright-core'));
const U = process.env.AGENT_CITY_SHOT_URL || 'http://127.0.0.1:8798', TMP = '/tmp/v9-shots'; fs.mkdirSync(TMP, { recursive: true });
const ready = p => p.waitForFunction(() => window.__office2d && window.__office2d.ready && window.__office2d.frames > 20, null, { timeout: 60000 });
const open = async (b, qs) => { const p = await b.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 }); p.on('pageerror', e => console.log('ERR', e.message)); await p.goto(`${U}/?q=0&${qs}`); await ready(p); return p; };
const box = (x0, y0, x1, y1) => { const k = 1600 / 1280; return { x: x0 * k, y: y0 * k - 0, width: (x1 - x0) * k, height: (y1 - y0) * k }; };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
  let p = await open(b, 't=22:30&notags=1');
  // faces: a chatting pair, the same pair a moment later, two more pairs mid-turn
  const chat = async (who, name, clip, wait) => { await p.evaluate(n => window.__office2d.neighbourChat(n), who); await p.waitForTimeout(wait); await p.screenshot({ path: `${TMP}/${name}.png`, clip }); };
  await chat('Studio', 'f1', box(290, 400, 470, 570), 2600); await p.waitForTimeout(1900); await p.screenshot({ path: `${TMP}/f2.png`, clip: box(290, 400, 470, 570) });
  await p.waitForTimeout(9000); await chat('SBP', 'f3', box(556, 400, 736, 570), 2600); await p.waitForTimeout(9000); await chat('Ops', 'f4', box(808, 400, 988, 570), 2600);
  await p.close();
  p = await open(b, 't=22:30&notags=1'); await p.waitForTimeout(1500);
  await p.screenshot({ path: `${TMP}/h-night.png`, clip: box(390, 340, 800, 420) }); await p.screenshot({ path: `${TMP}/mon-night.png` }); await p.close();
  p = await open(b, 't=18:30&notags=1'); await p.waitForTimeout(1500);
  await p.screenshot({ path: `${TMP}/h-dusk.png`, clip: box(390, 340, 800, 420) }); await p.screenshot({ path: `${TMP}/mon-dusk.png` }); await p.close();
  p = await open(b, 't=22:30'); await p.waitForTimeout(1500); await p.screenshot({ path: path.join(ROOT, 'shots', 'v9-night.png') }); await p.close();
  await b.close();
  execFileSync('python3', ['-c', `
from PIL import Image
T='${TMP}/'; S='${ROOT}/shots/'
c=Image.new('RGB',(450*4,425),(20,16,26))
for i,n in enumerate(['f1','f2','f3','f4']): c.paste(Image.open(T+n+'.png').convert('RGB'),(450*i,0))
c.save(S+'v9-faces.png')
a=Image.open(T+'h-night.png').convert('RGB'); b=Image.open(T+'h-dusk.png').convert('RGB'); c=Image.new('RGB',(a.width,a.height*2+8)); c.paste(a,(0,0)); c.paste(b,(0,a.height+8)); c.save(S+'v9-harbor.png')
Z=2.5*2/2
boxes=[(290,405,470,470),(560,405,730,470),(815,405,985,470),(1020,425,1230,505),(510,500,780,600),(845,505,1050,590)]
W=1800; c=Image.new('RGB',(W,1360),(16,12,22)); y=0
for j,n in enumerate(['night','dusk']):
    m=Image.open(T+'mon-'+n+'.png').convert('RGB')
    for i,(x0,y0,x1,y1) in enumerate(boxes):
        k=2.5; cr=m.crop((int(x0*k),int(y0*k),int(x1*k),int(y1*k))); s=min(590/cr.width,330/cr.height); cr=cr.resize((int(cr.width*s),int(cr.height*s)),Image.LANCZOS)
        c.paste(cr,(5+(i%3)*600,5+(i//3)*340+j*680))
c.save(S+'v9-monitors.png')
`]);
  console.log('shots/v9-{faces,harbor,monitors,night}.png');
})().catch(e => { console.error(e); process.exit(1); });

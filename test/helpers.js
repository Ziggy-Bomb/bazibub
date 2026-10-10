// Shared harness: static server for the repo root, Chromium launcher, and page factory.
// CDN scripts are served from local node_modules so tests run offline; map tiles are aborted.
const { chromium } = require('playwright-core');
const fs = require('fs');
const http = require('http');
const path = require('path');
const NM = path.join(__dirname, 'node_modules');
const ROOT = path.resolve(__dirname, '..');
const BROKER = 'ws://127.0.0.1:9001';
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium';

function serve(port = 8081) {
  const srv = http.createServer((req, res) => {
    const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(r => srv.listen(port, '127.0.0.1', () => r(srv)));
}

async function launch() {
  const browser = await chromium.launch({ executablePath: CHROMIUM, args: ['--no-sandbox', '--no-proxy-server'] });
  const errors = [];
  async function newPage(name, { net = 'mqtt', pos = 'manual', ctx = null, file = 'fieldops.html', init = null } = {}) {
    const context = ctx || await browser.newContext();
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(`[${name}] pageerror: ${e.message}`));
    page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/net::ERR|Failed to load resource/.test(t)) errors.push(`[${name}] console: ${t}`); });
    if (init) await page.addInitScript(init);
    await page.route('**/*', route => {
      const url = route.request().url();
      if (url.includes('/leaflet.js')) return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(NM, 'leaflet/dist/leaflet.js')) });
      if (url.includes('mqtt.min.js')) return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(NM, 'mqtt/dist/mqtt.min.js')) });
      if (url.startsWith('http://127.0.0.1')) return route.continue();
      return route.abort();
    });
    await page.goto('http://127.0.0.1:8081/' + file);
    await page.waitForTimeout(500);
    await page.evaluate(([b, n, p]) => {
      document.getElementById('adv').open = true;
      document.getElementById('in-broker').value = b;
      document.getElementById('in-net').value = n;
      document.getElementById('in-pos').value = p;
    }, [BROKER, net, pos]);
    return page;
  }
  return { browser, errors, newPage };
}

const teleport = (page, lat, lng) => page.evaluate(([la, lo]) => {
  S.myPos = { lat: la, lng: lo, acc: 3, ts: Date.now() }; S.dest = null; pubLoc(true);
}, [lat, lng]);
const screenOn = (page, id) => page.evaluate(i => document.getElementById(i).classList.contains('on'), id);
const sleep = ms => new Promise(r => setTimeout(r, ms));

let fails = 0;
function check(label, ok, extra = '') { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`); if (!ok) fails++; }
function finish(errors) {
  if (errors.length) { console.log('---- page errors ----\n' + errors.join('\n')); fails++; }
  console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL CHECKS PASSED');
  process.exit(fails ? 1 : 0);
}
module.exports = { serve, launch, teleport, screenOn, sleep, check, finish };

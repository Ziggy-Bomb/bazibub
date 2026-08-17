const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const NM = path.join(__dirname, 'node_modules');
const BROKER = 'ws://127.0.0.1:9001';

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--no-proxy-server'] });
  const errors = [];
  async function newPage(name) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`[${name}] pageerror: ${e.message}`));
    page.on('console', m => {
      const t = m.text();
      if (m.type() === 'error' && !/tile.openstreetmap|net::ERR/.test(t)) errors.push(`[${name}] console: ${t}`);
    });
    // serve CDN libs from local npm copies; kill tile requests
    await page.route('**/*', route => {
      const url = route.request().url();
      if (url.includes('leaflet.js')) return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(NM, 'leaflet/dist/leaflet.js')) });
      if (url.includes('leaflet.css')) return route.fulfill({ contentType: 'text/css', body: fs.readFileSync(path.join(NM, 'leaflet/dist/leaflet.css')) });
      if (url.includes('mqtt.min.js')) return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(NM, 'mqtt/dist/mqtt.min.js')) });
      if (url.startsWith('file://')) return route.continue();
      return route.abort();
    });
    await page.goto('file://' + require('path').resolve(__dirname, '../fieldops.html') + '');
    await page.waitForTimeout(800);
    await page.evaluate(b => {
      document.querySelector('details').open = true;
      document.getElementById('in-broker').value = b;
    }, BROKER);
    await page.check('#in-test');
    return page;
  }
  const teleport = (page, lat, lng) => page.evaluate(([la, lo]) => {
    S.myPos = { lat: la, lng: lo, acc: 5, ts: Date.now() };
    pubLoc(true);
  }, [lat, lng]);

  // ---------- GM creates a MANHUNT op ----------
  const gm = await newPage('gm');
  await gm.fill('#in-name', 'GAMEMASTER');
  await gm.click('#bt-create');
  const modeCount = await gm.locator('.mode').count();
  await gm.locator('.mode').nth(1).click(); // MANHUNT
  await gm.click('#bt-launch');
  await gm.waitForTimeout(2000);
  const code = (await gm.textContent('#lb-code')).trim();
  const netOk = await gm.evaluate(() => document.getElementById('hud-net').className);
  console.log(`modes:${modeCount} code:${code} gm-net:${netOk}`);

  // ---------- hunter + runner join ----------
  const hunter = await newPage('hunter');
  await hunter.fill('#in-name', 'HICKS');
  await hunter.fill('#in-code', code);
  await hunter.click('#bt-join');
  await hunter.waitForTimeout(2000);
  console.log('hunter team screen:', await hunter.evaluate(() => document.getElementById('scr-team').classList.contains('on')));
  console.log('teams offered:', (await hunter.locator('#team-btns .btn').allTextContents()).map(s => s.trim()).join(' | '));
  await hunter.locator('#team-btns .btn').nth(0).click(); // HUNTERS

  const runner = await newPage('runner');
  await runner.fill('#in-name', 'RIPLEY');
  await runner.fill('#in-code', code);
  await runner.click('#bt-join');
  await runner.waitForTimeout(2000);
  await runner.locator('#team-btns .btn').nth(1).click(); // RUNNERS

  // positions: hunter 500m away from runner
  await teleport(gm, 51.5000, -0.0900);
  await teleport(hunter, 51.5000, -0.0900);
  await teleport(runner, 51.5045, -0.0900); // ~500m north
  await gm.waitForTimeout(1500);

  // lobby roster on GM shows 3 units
  const roster = await gm.evaluate(() => document.getElementById('lb-roster').innerText);
  console.log('lobby roster:', roster.replace(/\n+/g, ' / '));

  // ---------- start op ----------
  await gm.click('#bt-start');
  await gm.waitForTimeout(2500);
  console.log('runner in game:', await runner.evaluate(() => document.getElementById('scr-game').classList.contains('on')),
    '| hunter in game:', await hunter.evaluate(() => document.getElementById('scr-game').classList.contains('on')));

  // visibility rules: hunter sees runner as ping; runner must NOT see hunter
  const hunterSees = await hunter.evaluate(() => {
    const p = Object.values(S.players).find(x => x.name === 'RIPLEY');
    const v = p && visibleEntry(p);
    return v ? { ping: !!v.ping } : null;
  });
  const runnerSeesHunter = await runner.evaluate(() => {
    const p = Object.values(S.players).find(x => x.name === 'HICKS');
    return !!(p && visibleEntry(p));
  });
  const runnerSeesGm = await runner.evaluate(() => {
    const p = Object.values(S.players).find(x => x.role === 'gm');
    return !!(p && visibleEntry(p));
  });
  console.log('hunter sees runner (as ping):', JSON.stringify(hunterSees),
    '| runner sees hunter:', runnerSeesHunter, '| runner sees GM:', runnerSeesGm);

  // radar draws on hunter
  await hunter.locator('.tb[data-tab="radar"]').click();
  await hunter.waitForTimeout(700);
  console.log('hunter radar contacts:', await hunter.evaluate(() => radarContacts().length));

  // team ping: runner pings, GM log picks it up
  await runner.evaluate(() => pingTeam());
  await runner.waitForTimeout(800);

  // chat: hunter TX, gm receives, runner (other team) must not
  await hunter.locator('.tb[data-tab="comms"]').click();
  await hunter.fill('#in-chat', 'closing in');
  await hunter.click('#bt-chat');
  await hunter.waitForTimeout(800);
  const gmLog = await gm.evaluate(() => S.evlog.join(''));
  const runnerLog = await runner.evaluate(() => S.evlog.join(''));
  console.log('gm sees hunter chat:', gmLog.includes('closing in'), '| runner sees hunter chat:', runnerLog.includes('closing in'));

  // ---------- tag: hunter teleports next to runner ----------
  await teleport(hunter, 51.50451, -0.0900); // ~1m away
  await runner.waitForTimeout(5000);          // runner tick self-reports the tag
  const tagged = await runner.evaluate(() => ({ out: S.meOut, over: S.over && S.over.text }));
  const gmOver = await gm.evaluate(() => S.over && S.over.text);
  console.log('runner tagged:', JSON.stringify(tagged), '| gm sees over:', gmOver);

  console.log('---- errors ----');
  console.log(errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  process.exit(errors.length ? 2 : 0);
})().catch(e => { console.error('SMOKE FAIL', e); process.exit(1); });

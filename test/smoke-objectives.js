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
    page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/net::ERR/.test(t)) errors.push(`[${name}] console: ${t}`); });
    await page.route('**/*', route => {
      const url = route.request().url();
      if (url.includes('leaflet.js')) return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(NM, 'leaflet/dist/leaflet.js')) });
      if (url.includes('leaflet.css')) return route.fulfill({ contentType: 'text/css', body: fs.readFileSync(path.join(NM, 'leaflet/dist/leaflet.css')) });
      if (url.includes('mqtt.min.js')) return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(NM, 'mqtt/dist/mqtt.min.js')) });
      if (url.startsWith('file://')) return route.continue();
      return route.abort();
    });
    await page.goto('file://' + require('path').resolve(__dirname, '../fieldops.html') + '');
    await page.waitForTimeout(600);
    await page.evaluate(b => { document.querySelector('details').open = true; document.getElementById('in-broker').value = b; }, BROKER);
    await page.check('#in-test');
    return page;
  }
  const teleport = (page, lat, lng) => page.evaluate(([la, lo]) => { S.myPos = { lat: la, lng: lo, acc: 5, ts: Date.now() }; pubLoc(true); }, [lat, lng]);

  /* ============ TEST A: WAYPOINT RACE + clue cache ============ */
  const gm = await newPage('gm');
  gm.on('dialog', d => d.type() === 'prompt' ? d.accept('THE EAGLE HAS LANDED') : d.accept());
  await gm.fill('#in-name', 'GM');
  await gm.click('#bt-create');
  await gm.locator('.mode').nth(2).click(); // WAYPOINT RACE
  await gm.selectOption('#cfg-teams', '1');
  await gm.click('#bt-launch');
  await gm.waitForTimeout(1500);
  const code = (await gm.textContent('#lb-code')).trim();
  console.log('A: code', code);

  // GM opens console, teleports (to anchor the map), places 2 waypoints + 1 clue by real map clicks
  await gm.click('#bt-console');
  await gm.waitForTimeout(800);
  await teleport(gm, 51.5000, -0.0900);
  await gm.waitForTimeout(2500); // map centers on fix via renderMap
  await gm.locator('.gmtool[data-tool="wp"]').click();   // also switches to map tab
  await gm.waitForTimeout(400);
  await gm.locator('#map').click({ position: { x: 150, y: 150 } });
  await gm.locator('#map').click({ position: { x: 260, y: 200 } });
  await gm.waitForTimeout(300);
  await gm.locator('.tb[data-tab="gm"]').click();
  await gm.locator('.gmtool[data-tool="clue"]').click();
  await gm.waitForTimeout(300);
  await gm.locator('#map').click({ position: { x: 200, y: 260 } });
  await gm.waitForTimeout(500);
  const obj = await gm.evaluate(() => ({ wps: S.game.wps, clues: S.game.clues.map(c => ({ lat: c.lat, lng: c.lng, text: c.text })) }));
  console.log('A: placed', obj.wps.length, 'wps,', obj.clues.length, 'clues');

  // player joins, GM starts
  const pl = await newPage('pl');
  await pl.fill('#in-name', 'NEWT');
  await pl.fill('#in-code', code);
  await pl.click('#bt-join');
  await pl.waitForTimeout(1500);
  await pl.locator('#team-btns .btn').first().click(); // ALPHA
  await pl.waitForTimeout(400);
  await teleport(pl, 51.5000, -0.0900);
  await gm.locator('.tb[data-tab="gm"]').click();
  await gm.click('#bt-start2');
  await gm.waitForTimeout(2000);
  console.log('A: player in game:', await pl.evaluate(() => document.getElementById('scr-game').classList.contains('on')));

  // player walks to clue → modal with text
  await teleport(pl, obj.clues[0].lat, obj.clues[0].lng);
  await pl.waitForTimeout(4500);
  const modalText = await pl.evaluate(() => ({ open: !document.getElementById('modal').hidden, body: document.getElementById('modal-body').textContent }));
  console.log('A: clue modal:', JSON.stringify(modalText));
  await pl.evaluate(() => { document.getElementById('modal').hidden = true; });

  // player captures wp1 then wp2 → win
  await teleport(pl, obj.wps[0].lat, obj.wps[0].lng);
  await pl.waitForTimeout(4500);
  console.log('A: progress after wp1:', await pl.evaluate(() => S.progress));
  await teleport(pl, obj.wps[1].lat, obj.wps[1].lng);
  await pl.waitForTimeout(4500);
  console.log('A: over (player):', await pl.evaluate(() => S.over && S.over.text),
    '| over (gm):', await gm.evaluate(() => S.over && S.over.text));

  /* ============ TEST B: HOLD THE LINE (horde relay + kill) ============ */
  const gm2 = await newPage('gm2');
  await gm2.fill('#in-name', 'APONE');
  await gm2.click('#bt-create');
  await gm2.locator('.mode').nth(5).click(); // HOLD THE LINE
  await gm2.click('#bt-launch');
  await gm2.waitForTimeout(1500);
  const code2 = (await gm2.textContent('#lb-code')).trim();
  await gm2.click('#bt-console');
  await gm2.waitForTimeout(800);
  await teleport(gm2, 51.6000, -0.1000);
  await gm2.waitForTimeout(2500);
  await gm2.locator('.tb[data-tab="gm"]').click();
  await gm2.locator('.gmtool[data-tool="defend"]').click();
  await gm2.waitForTimeout(300);
  await gm2.locator('#map').click({ position: { x: 200, y: 200 } });
  await gm2.waitForTimeout(400);

  const pl2 = await newPage('pl2');
  await pl2.fill('#in-name', 'VASQUEZ');
  await pl2.fill('#in-code', code2);
  await pl2.click('#bt-join');
  await pl2.waitForTimeout(1500);
  await pl2.locator('#team-btns .btn').first().click(); // DEFENDERS
  await pl2.waitForTimeout(300);
  await teleport(pl2, 51.6000, -0.1000);
  await gm2.locator('.tb[data-tab="gm"]').click();
  await gm2.click('#bt-start2');
  await gm2.waitForTimeout(7000); // a few horde ticks
  const horde = await pl2.evaluate(() => S.horde && { wave: S.horde.wave, aliens: S.horde.aliens.length, lives: S.horde.lives });
  console.log('B: horde state on player:', JSON.stringify(horde));
  // player intercepts first alien
  const alien = await pl2.evaluate(() => S.horde.aliens[0]);
  if (alien) {
    await teleport(pl2, alien.lat, alien.lng);
    await pl2.waitForTimeout(5000);
    console.log('B: kills after intercept:', await pl2.evaluate(() => S.horde.kills));
  }
  const hud = await pl2.evaluate(() => document.getElementById('action-info').textContent);
  console.log('B: player action HUD:', hud);

  console.log('---- errors ----');
  console.log(errors.length ? errors.join('\n') : '(none)');
  await browser.close();
  process.exit(errors.length ? 2 : 0);
})().catch(e => { console.error('SMOKE2 FAIL', e); process.exit(1); });

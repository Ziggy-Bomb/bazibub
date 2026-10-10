// Waypoint race + clue cache + Hold the Line over the MQTT relay (needs `node broker.js` running).
const { serve, launch, teleport, screenOn, sleep, check, finish, dismiss } = require('./helpers');
(async () => {
  const srv = await serve();
  const { browser, errors, newPage } = await launch();

  /* ---- A: waypoint race with a GM-placed course and a clue cache ---- */
  const gm = await newPage('gm');
  await gm.fill('#in-name', 'GM');
  await gm.click('#bt-create');
  await gm.locator('#mode-list .mode').nth(2).click(); // WAYPOINT RACE
  await gm.selectOption('#cfg-teams', '1');
  await gm.click('#bt-launch');
  await sleep(1500);
  const code = (await gm.textContent('#lb-code')).trim();
  await gm.click('#bt-console');
  await sleep(800);
  await teleport(gm, 51.5000, -0.0900);
  await sleep(1500);
  await gm.locator('#bt-start2').click();
  check('START refuses an empty course', await gm.evaluate(() => !S.game.started));
  await gm.locator('.gmtool[data-tool="wp"]').click();
  await sleep(300);
  await gm.locator('#map').click({ position: { x: 150, y: 150 } });
  await gm.locator('#map').click({ position: { x: 260, y: 200 } });
  await gm.locator('.tb[data-tab="gm"]').click();
  await gm.locator('.gmtool[data-tool="clue"]').click();
  await sleep(300);
  await gm.locator('#map').click({ position: { x: 200, y: 260 } });
  await sleep(300);
  check('clue tool opens in-page text dialog', !await gm.evaluate(() => document.getElementById('ask').hidden));
  await gm.fill('#ask-input', 'THE EAGLE HAS LANDED');
  await gm.click('#ask-ok');
  await sleep(400);
  const obj = await gm.evaluate(() => ({ wps: S.game.wps, clues: S.game.clues }));
  check('GM placed 2 waypoints and 1 cache', obj.wps.length === 2 && obj.clues.length === 1);

  const pl = await newPage('pl');
  await pl.fill('#in-name', 'NEWT'); await pl.fill('#in-code', code); await pl.click('#bt-join');
  await sleep(2500);
  await pl.locator('#team-btns .btn').first().click();
  await teleport(pl, 51.5000, -0.0900);
  await gm.locator('.tb[data-tab="gm"]').click();
  await gm.click('#bt-start2');
  await sleep(2000);
  check('player in game', await screenOn(pl, 'scr-game'));
  await dismiss(pl);

  await teleport(pl, obj.clues[0].lat, obj.clues[0].lng);
  await sleep(3000);
  check('clue modal shows GM text', await pl.evaluate(() => !document.getElementById('modal').hidden && document.getElementById('modal-body').textContent === 'THE EAGLE HAS LANDED'));
  await pl.click('#modal-ok');
  await teleport(pl, obj.wps[0].lat, obj.wps[0].lng);
  await sleep(3000);
  check('WP1 captured', await pl.evaluate(() => S.progress.ALPHA) === 1);
  await teleport(pl, obj.wps[1].lat, obj.wps[1].lng);
  await sleep(3000);
  const over = await pl.evaluate(() => S.over && S.over.text);
  check('course complete wins', /ALPHA WINS/.test(over || ''), over);

  /* ---- B: Hold the Line with auto-laid defend point and GM-added AI defenders ---- */
  const gm2 = await newPage('gm2');
  await gm2.fill('#in-name', 'APONE');
  await gm2.click('#bt-create');
  await gm2.locator('#mode-list .mode').nth(5).click(); // HOLD THE LINE
  await gm2.click('#bt-launch');
  await sleep(1500);
  const code2 = (await gm2.textContent('#lb-code')).trim();
  await gm2.click('#bt-console');
  await teleport(gm2, 51.6000, -0.1000);
  await sleep(800);
  await gm2.click('#bt-autolay');
  await sleep(300);
  check('auto-lay sets defend point + play area', await gm2.evaluate(() => !!S.game.defend && !!S.game.area));
  await gm2.locator('.tb[data-tab="gm"]').click();
  await gm2.click('#bt-addbots');
  await sleep(2500);
  check('GM AI units appear as players', await gm2.evaluate(() => Object.values(S.players).filter(p => p.bot).length) === 2);

  const pl2 = await newPage('pl2');
  await pl2.fill('#in-name', 'VASQUEZ'); await pl2.fill('#in-code', code2); await pl2.click('#bt-join');
  await sleep(2500);
  await pl2.locator('#team-btns .btn').first().click();
  await teleport(pl2, 51.6000, -0.1000);
  await gm2.click('#bt-start2');
  await sleep(1500); await dismiss(pl2);
  await sleep(6500);
  const horde = await pl2.evaluate(() => S.horde && { wave: S.horde.wave, aliens: S.horde.aliens.length });
  check('horde state relayed to player', !!horde && horde.aliens > 0, JSON.stringify(horde));
  const alien = await pl2.evaluate(() => S.horde.aliens[0]);
  await teleport(pl2, alien.lat, alien.lng);
  await sleep(3000);
  check('player intercept kills a contact', await pl2.evaluate(() => S.horde.kills) >= 1);

  await browser.close(); srv.close(); finish(errors);
})().catch(e => { console.error('FATAL', e); process.exit(1); });

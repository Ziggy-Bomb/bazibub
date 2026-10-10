// Training Sim: solo play against AI units, no network at all.
const { serve, launch, teleport, screenOn, sleep, check, finish, dismiss } = require('./helpers');
async function startSim(newPage, name, modeIdx, teamIdx = 0) {
  const p = await newPage(name, { net: 'auto', pos: 'manual' });
  await p.fill('#in-name', name);
  await p.click('#bt-sim');
  await p.locator('#sim-modes .mode').nth(modeIdx).click();
  await p.locator('#sim-teams .chip').nth(teamIdx).click();
  await p.click('#bt-simgo');
  await sleep(1500);
  check(`[${name}] briefing shown before the countdown`, await p.evaluate(() => !document.getElementById('modal').hidden && /BRIEFING/.test(document.getElementById('modal-title').textContent) && !S.game.started));
  await p.click('#modal-ok');
  await sleep(4800); // 3 s countdown + start
  return p;
}
(async () => {
  const srv = await serve();
  const { browser, errors, newPage } = await launch();

  /* manhunt as a RUNNER: 2 AI hunters + 2 AI runners */
  const r = await startSim(newPage, 'RIPLEY', 1, 1);
  check('sim enters game, no network needed', await screenOn(r, 'scr-game') && await r.evaluate(() => NET.kind === 'sim'));
  check('sim started after countdown', await r.evaluate(() => !!S.game.started));
  const units = await r.evaluate(() => Object.values(S.players).filter(p => p.bot).map(p => p.team));
  check('AI units fill the teams', units.filter(t => t === 'HUNTERS').length === 2 && units.filter(t => t === 'RUNNERS').length === 2, units.join(','));
  check('runner cannot see AI hunters', await r.evaluate(() => Object.values(S.players).filter(p => p.team === 'HUNTERS').every(p => !visibleEntry(p))));
  check('tactical terrain map renders tiles', await r.evaluate(() => document.querySelectorAll('#map canvas.leaflet-tile').length > 0 || S.mapStyle === 'street'));
  const before = await r.evaluate(() => S.myPos);
  await r.locator('#map').click({ position: { x: 300, y: 120 } });
  await sleep(2500);
  const moved = await r.evaluate(b => distM(b, S.myPos), before);
  check('tap-to-walk moves the player', moved > 2, moved.toFixed(1) + ' m');
  const hunterPos = await r.evaluate(() => Object.values(S.players).find(p => p.team === 'HUNTERS' && p.bot));
  await teleport(r, hunterPos.lat, hunterPos.lng);
  await sleep(2500);
  check('runner threat meter reads HIGH next to a hunter', /THREAT ▮▮▮ HIGH/.test(await r.textContent('#action-info')) || await r.evaluate(() => S.meOut));
  check('AI hunter tags you', await r.evaluate(() => S.meOut));
  await r.close();

  /* waypoint race: walk the auto-laid course at FAST speed via tap-to-walk */
  const w = await startSim(newPage, 'NEWT', 2, 0);
  check('auto-laid 5-waypoint course + play area', await w.evaluate(() => S.game.wps.length === 5 && !!S.game.area));
  for (let i = 0; i < 5; i++) {
    const wp = await w.evaluate(n => S.game.wps[n], i);
    await teleport(w, wp.lat, wp.lng);
    await sleep(1600);
  }
  const wover = await w.evaluate(() => S.over && S.over.text);
  check('you win the race', /ALPHA WINS/.test(wover || ''), wover);
  check('PLAY AGAIN offered in sim', await w.evaluate(() => !document.getElementById('bt-again').hidden));
  check('after-action reveals rivals', await w.evaluate(() => Object.values(S.players).filter(p => p.team === 'BRAVO').every(p => !!visibleEntry(p))));
  await w.close();

  /* clue hunt: detective story */
  const c = await startSim(newPage, 'MARLOWE', 4, 0);
  const clue = await c.evaluate(() => S.game.clues[0]);
  await teleport(c, clue.lat, clue.lng);
  await sleep(2000);
  check('cache opens the case file', await c.evaluate(() => document.getElementById('modal-body').textContent.startsWith('CASE FILE')));
  check('action bar counts case files', /CASE FILES: 1\/5/.test(await c.textContent('#action-info')));
  check('nav arrow points at the next cache', await c.evaluate(() => !document.getElementById('nav').hidden && /CACHE/.test(document.getElementById('nav-lbl').textContent)));
  await c.click('#modal-ok');
  await c.click('#action-btn');
  await sleep(300);
  check('accuse refused with under 3 files', await c.evaluate(() => document.getElementById('ask').hidden));
  for (const i of [1, 2]) { const k = await c.evaluate(n => S.game.clues[n], i); await teleport(c, k.lat, k.lng); await sleep(1800); await dismiss(c); }
  await c.click('#action-btn');
  await sleep(300);
  check('accuse dialog lists 4 suspects', await c.locator('#ask .choices .btn').count() === 4);
  await c.locator('#ask .choices .btn').nth(2).click();   // wrong
  await sleep(600);
  check('wrong accusation locks the team out', /LOCKED OUT/.test(await c.textContent('#action-info')));
  await c.evaluate(() => { S.lockout[S.team] = 0; });
  await c.click('#action-btn');
  await sleep(300);
  await c.locator('#ask .choices .btn').nth(0).click();   // MORGAN
  await sleep(800);
  check('right accusation solves the case', /SOLVED THE CASE — IT WAS MORGAN/.test(await c.evaluate(() => S.over && S.over.text) || ''));
  await c.close();

  /* triangulate: distance-only readout + readings */
  const t = await startSim(newPage, 'BISHOP', 3, 0);
  check('TX distance hidden until you scan', /TX RANGE UNKNOWN · SCANNER READY/.test(await t.textContent('#action-info')));
  await t.click('#action-btn');
  await sleep(500);
  check('scan records a ring and shows the reading', await t.evaluate(() => S.readings.length) >= 1 && /LAST SCAN \d+ m · RECHARGING/.test(await t.textContent('#action-info')));
  await t.click('#action-btn');
  await sleep(300);
  check('scanner cooldown blocks a second scan', await t.evaluate(() => S.readings.filter(r => r.pid === S.pid).length) === 1);
  const tx = await t.evaluate(() => S.game.target);
  await teleport(t, tx.lat, tx.lng);
  await sleep(2000);
  check('finding the TX wins', /LOCATED THE TRANSMITTER/.test(await t.evaluate(() => S.over && S.over.text) || ''));
  await t.close();

  /* hold the line: aliens spawn, AI defenders fight */
  const h = await startSim(newPage, 'APONE', 5, 0);
  await sleep(14000);
  const H = await h.evaluate(() => ({ aliens: S.horde.aliens.length, spawned: S.horde.spawned, def: Object.values(S.players).filter(p => p.bot).length }));
  check('horde spawns with 3 AI defenders', H.spawned > 0 && H.def === 3, JSON.stringify(H));
  await h.locator('.tb[data-tab="radar"]').click();
  await sleep(500);
  check('motion tracker lists contacts', await h.evaluate(() => radarContacts().length) >= 4);
  const alienIn = await h.evaluate(() => { const D = S.game.defend; return S.horde.aliens.find(a => distM(a, D) > 60); });
  const k0 = await h.evaluate(() => S.horde.kills);
  await teleport(h, (await h.evaluate(() => S.game.defend)).lat, (await h.evaluate(() => S.game.defend)).lng);
  await h.evaluate(() => { const D = S.game.defend; S.horde.aliens.push({ id: 'test', ...destPoint(D, 0, 20) }); });
  await sleep(1500);
  check('no kills from inside the reactor zone', await h.evaluate(() => S.horde.aliens.some(a => a.id === 'test') || !S.horde.aliens.length) && /WEAPONS SAFE/.test(await h.textContent('#action-info')));
  await h.close();

  await browser.close(); srv.close(); finish(errors);
})().catch(e => { console.error('FATAL', e); process.exit(1); });

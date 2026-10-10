// GM + hunter + runner over the MQTT relay (needs `node broker.js` running).
const { serve, launch, teleport, screenOn, sleep, check, finish } = require('./helpers');
(async () => {
  const srv = await serve();
  const { browser, errors, newPage } = await launch();

  const gm = await newPage('gm');
  await gm.fill('#in-name', 'GAMEMASTER');
  await gm.click('#bt-create');
  check('six modes offered', await gm.locator('#mode-list .mode').count() === 6);
  await gm.locator('#mode-list .mode').nth(1).click(); // MANHUNT
  await gm.click('#bt-launch');
  await sleep(2000);
  const code = (await gm.textContent('#lb-code')).trim();
  check('GM connected to relay', await gm.evaluate(() => NET.kind === 'mqtt' && document.getElementById('hud-net').className === 'ok'), code);

  const hunter = await newPage('hunter');
  await hunter.fill('#in-name', 'HICKS'); await hunter.fill('#in-code', code); await hunter.click('#bt-join');
  await sleep(2500);
  check('joiner gets team screen', await screenOn(hunter, 'scr-team'));
  await hunter.locator('#team-btns .btn').nth(0).click(); // HUNTERS

  const runner = await newPage('runner');
  await runner.fill('#in-name', 'RIPLEY'); await runner.fill('#in-code', code); await runner.click('#bt-join');
  await sleep(2500);
  await runner.locator('#team-btns .btn').nth(1).click(); // RUNNERS

  await teleport(gm, 51.5000, -0.0900);
  await teleport(hunter, 51.5000, -0.0900);
  await teleport(runner, 51.5045, -0.0900); // ~500 m north
  await sleep(1500);
  const roster = await gm.evaluate(() => document.getElementById('lb-roster').innerText);
  check('lobby roster lists all 3', ['HICKS', 'RIPLEY', 'GAMEMASTER'].every(n => roster.includes(n)));

  await gm.click('#bt-start');
  await sleep(2500);
  check('players enter game on START', await screenOn(runner, 'scr-game') && await screenOn(hunter, 'scr-game'));

  const hunterSees = await hunter.evaluate(() => { const p = Object.values(S.players).find(x => x.name === 'RIPLEY'); const v = p && visibleEntry(p); return v && v.ping; });
  const runnerSeesHunter = await runner.evaluate(() => { const p = Object.values(S.players).find(x => x.name === 'HICKS'); return !!(p && visibleEntry(p)); });
  const runnerSeesGm = await runner.evaluate(() => { const p = Object.values(S.players).find(x => x.role === 'gm'); return !!(p && visibleEntry(p)); });
  check('hunter sees runner only as delayed ping', hunterSees === true);
  check('runner cannot see hunter or GM', !runnerSeesHunter && !runnerSeesGm);

  await hunter.locator('.tb[data-tab="radar"]').click();
  await sleep(600);
  check('hunter radar has a contact', await hunter.evaluate(() => radarContacts().length) >= 1);

  await hunter.locator('.tb[data-tab="comms"]').click();
  await hunter.fill('#in-chat', 'closing in'); await hunter.click('#bt-chat');
  await sleep(800);
  check('team chat reaches GM, not the other team',
    await gm.evaluate(() => S.evlog.join('').includes('closing in')) && !await runner.evaluate(() => S.evlog.join('').includes('closing in')));

  await teleport(hunter, 51.50451, -0.0900);
  await sleep(4000);
  check('runner tagged when hunter closes', await runner.evaluate(() => S.meOut));
  const over = await gm.evaluate(() => S.over && S.over.text);
  check('host declares hunters win', /HUNTERS WIN/.test(over || ''), over);
  check('score table shows the tag', /TAGS/.test(await runner.evaluate(() => document.getElementById('score').innerText)));

  await browser.close(); srv.close(); finish(errors);
})().catch(e => { console.error('FATAL', e); process.exit(1); });

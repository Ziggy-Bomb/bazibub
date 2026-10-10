const { serve, launch, sleep, teleport, check, finish } = require('./helpers');
(async () => {
  const srv = await serve(); const { browser, errors, newPage } = await launch();
  const p = await newPage('again', { net: 'auto', pos: 'manual' });
  await p.click('#bt-sim'); await p.locator('#sim-modes .mode').nth(2).click(); await p.click('#bt-simgo');
  await sleep(1200);
  check('empty call sign gets a generated one', /^(RECRUIT|ROOKIE|CADET)-\d\d$/.test(await p.evaluate(() => S.name)));
  await p.click('#modal-ok'); await sleep(4500);
  await p.evaluate(() => pubEv({ type: 'over', text: 'TEST OVER' })); await sleep(500);
  await p.click('#bt-again'); await sleep(3000); 
  check('PLAY AGAIN relaunches the same sim', await p.evaluate(() => S.sim && S.game && S.game.mode === 'waypoint' && !document.getElementById('modal').hidden));
  await browser.close(); srv.close(); finish(errors);
})();

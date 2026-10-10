// Offline multiplayer: (A) same-browser tabs over BroadcastChannel, and
// (B) the Claude-artifact room transport, using a stand-in room that enforces
// the platform's 4 KiB message cap (so chunking is exercised).
const { serve, launch, teleport, screenOn, sleep, check, finish, dismiss } = require('./helpers');
const FAKE_ROOM = () => {
  const bc = new BroadcastChannel('fake-room');
  const handlers = {};
  bc.onmessage = e => (handlers[e.data.topic] || []).forEach(h => h({ topic: e.data.topic, data: e.data.data, isMe: false, sameTab: false }));
  const named = {
    on(topic, h) { (handlers[topic] = handlers[topic] || []).push(h); return () => {}; },
    emit(topic, data) {
      const bytes = new TextEncoder().encode(JSON.stringify(data)).length;
      window.__maxEmit = Math.max(window.__maxEmit || 0, bytes);
      if (bytes > 4096) return Promise.reject({ code: 'invalid_argument', message: 'over 4 KiB' });
      bc.postMessage({ topic, data });
      setTimeout(() => (handlers[topic] || []).forEach(h => h({ topic, data, isMe: true, sameTab: true })), 0);
      return Promise.resolve();
    },
    onConnection(h) { setTimeout(() => h(true), 0); return () => {}; },
    connected() { return true; },
    leave() { return Promise.resolve(); },
  };
  window.claude = { use: async n => n === 'room' ? { join: async () => named } : null };
};
(async () => {
  const srv = await serve();
  const { browser, errors, newPage } = await launch();

  for (const [label, opts] of [['tabs', { net: 'local' }], ['artifact room', { net: 'auto', init: FAKE_ROOM }]]) {
    const ctx = await browser.newContext();
    const gm = await newPage('gm-' + label, { ...opts, ctx });
    if (label === 'artifact room') {
      check('artifact build defaults to manual nav', await gm.evaluate(() => IN_ARTIFACT && document.getElementById('in-pos').value === 'manual'));
      await gm.evaluate(() => { document.getElementById('in-pos').value = 'manual'; });
    }
    await gm.fill('#in-name', 'GM');
    await gm.click('#bt-create');
    await gm.locator('#mode-list .mode').nth(4).click(); // CLUE HUNT
    await gm.click('#bt-launch');
    await sleep(1200);
    const code = (await gm.textContent('#lb-code')).trim();
    check(`[${label}] transport selected`, await gm.evaluate(() => NET.kind), await gm.evaluate(() => NET.kind));
    await gm.click('#bt-console');
    await sleep(500);
    // a long clue pushes the game doc past one 4 KiB message
    await gm.evaluate(() => { autoLay(S.game, S.myPos); S.game.clues.forEach(c => c.text = c.text + ' ' + 'X'.repeat(600)); pubGame(); });
    const pl = await newPage('pl-' + label, { ...opts, ctx });
    await pl.fill('#in-name', 'SAM'); await pl.fill('#in-code', code); await pl.click('#bt-join');
    await sleep(6500); // periodic game-doc rebroadcast reaches the late joiner
    check(`[${label}] late joiner receives game doc`, await screenOn(pl, 'scr-team') && await pl.evaluate(() => S.game && S.game.clues.length === 5));
    await pl.locator('#team-btns .btn').first().click();
    await sleep(500);
    check(`[${label}] manual joiner spawns near the GM`, await pl.evaluate(() => distM(S.myPos, S.game.origin) < 200));
    await gm.locator('.tb[data-tab="gm"]').click();
    await gm.click('#bt-start2');
    await sleep(1500);
    check(`[${label}] player enters on START`, await screenOn(pl, 'scr-game'));
    const clue = await pl.evaluate(() => S.game.clues[2]);
    await teleport(pl, clue.lat, clue.lng);
    await sleep(2500);
    check(`[${label}] GM log sees the cache open`, await gm.evaluate(() => S.evlog.join('').includes('opened a cache')));
    if (label === 'artifact room') check('room messages stayed under 4 KiB (chunked)', await gm.evaluate(() => window.__maxEmit) <= 4096, String(await gm.evaluate(() => window.__maxEmit)) + ' B max');
    await ctx.close();
  }
  await browser.close(); srv.close(); finish(errors);
})().catch(e => { console.error('FATAL', e); process.exit(1); });

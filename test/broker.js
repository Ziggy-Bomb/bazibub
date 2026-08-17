const { Aedes } = require('aedes');
const { WebSocketServer, createWebSocketStream } = require('ws');
(async () => {
  const aedes = new Aedes();
  await aedes.listen();
  aedes.on('client', c => console.log('client connected:', c.id));
  aedes.on('publish', (pkt, c) => {
    if (c) console.log('PUB from', c.id, ':', pkt.topic, 'retain:', pkt.retain, 'len:', (pkt.payload || '').length);
  });
  aedes.on('connectionError', (c, e) => console.log('connErr:', e.message));
  aedes.on('clientError', (c, e) => console.log('clientErr:', e.message));
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 9001 });
  wss.on('connection', ws => aedes.handle(createWebSocketStream(ws)));
  console.log('broker ws://127.0.0.1:9001');
})();

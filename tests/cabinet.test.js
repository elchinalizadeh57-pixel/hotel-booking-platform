const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/app');

let server, base, ctx, tok;
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test.before(async () => {
  ctx = createApp({ dbFile: ':memory:' });
  await new Promise((r) => { server = ctx.app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
  tok = (await api('/api/auth/login', { method: 'POST', body: { email: 'hotel@hotel.local', password: 'Hotel123!' } })).data.token;
});
test.after(() => { server.close(); ctx.close(); });

async function api(path, { method = 'GET', body, token = tok } = {}) {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token && { authorization: 'Bearer ' + token }) }, body: body && JSON.stringify(body) });
  return { status: r.status, data: await r.json().catch(() => null), res: r };
}
const offers = async () => (await api(`/api/hotels/1?checkIn=${day(30)}&checkOut=${day(32)}`, { token: null })).data;

test('hotel adds, edits and deletes room types manually', async () => {
  const bad = await api('/api/hotel/rooms', { method: 'POST', body: { name: '', basePrice: 50 } });
  assert.equal(bad.status, 400);
  const r = await api('/api/hotel/rooms', { method: 'POST', body: { name: 'Honeymoon Villa', maxGuests: 2, bed: '1 king bed', area: 60, basePrice: 200, count: 2, amenities: ['wifi', 'bathtub', 'hacker'] } });
  assert.equal(r.status, 201);
  assert.deepEqual(r.data.amenities, ['wifi', 'bathtub']);
  assert.ok((await offers()).offers.some((o) => o.name === 'Honeymoon Villa'));
  const p = await api(`/api/hotel/rooms/${r.data.id}`, { method: 'PATCH', body: { basePrice: 250, count: 3 } });
  assert.equal(p.data.basePrice, 250); assert.equal(p.data.count, 3);
  assert.equal((await api(`/api/hotel/rooms/${r.data.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await api('/api/hotel/rooms/5', { method: 'PATCH', body: { name: 'x' } })).status, 404); // other hotel's room
});

test('room type with bookings cannot be deleted', async () => {
  const t = (await api('/api/auth/login', { method: 'POST', body: { email: 'tourist@hotel.local', password: 'Tourist123!' }, token: null })).data.token;
  const b = await api('/api/bookings', { method: 'POST', token: t, body: { roomTypeId: 2, checkIn: day(50), checkOut: day(51), payMethod: 'property', guest: { name: 'A B', email: 'a@b.co', phone: '+994501234567' } } });
  assert.equal(b.status, 201);
  assert.equal((await api('/api/hotel/rooms/2', { method: 'DELETE' })).status, 409);
});

test('hotel currency: prices are entered in the hotel currency and converted for the pricing engine', async () => {
  const before = (await offers()).offers.find((o) => o.id === 3).perNight; // USD for public
  const base = ctx.db.prepare('SELECT base_price FROM room_types WHERE id=3').get().base_price;
  // switch to AZN WITHOUT converting numbers: the same figure now means AZN, so USD price drops
  assert.equal((await api('/api/hotel/me', { method: 'PATCH', body: { currency: 'AZN' } })).status, 200);
  const after = (await offers()).offers.find((o) => o.id === 3).perNight;
  assert.ok(Math.abs(after - Math.round((before / 1.7) * 100) / 100) < 0.05, `${after} vs ${before / 1.7}`);
  // switch back WITH conversion: numbers are converted, price in USD is preserved
  assert.equal((await api('/api/hotel/me', { method: 'PATCH', body: { currency: 'USD', convertPrices: true } })).status, 200);
  assert.equal((await api('/api/hotel/me', { method: 'PATCH', body: { currency: 'XXX' } })).status, 400);
  const me = (await api('/api/hotel/me')).data;
  assert.equal(me.hotel.currency, 'USD');
  assert.ok(Math.abs(me.rooms.find((r) => r.id === 3).basePrice - base / 1.7) < 0.01, 'figure converted AZN->USD');
});

test('logo upload: validates type/size/magic bytes, is served and shown to guests', async () => {
  assert.equal((await api('/api/hotel/upload', { method: 'POST', body: { dataUrl: 'data:text/html;base64,PGI+' } })).status, 400);
  assert.equal((await api('/api/hotel/upload', { method: 'POST', body: { dataUrl: 'data:image/png;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64') } })).status, 400);
  assert.equal((await api('/api/hotel/upload', { method: 'POST', body: { dataUrl: PNG }, token: null })).status, 401);
  const up = await api('/api/hotel/upload', { method: 'POST', body: { dataUrl: PNG } });
  assert.equal(up.status, 201);
  assert.match(up.data.url, /^\/uploads\/h1-[0-9a-f]{16}\.png$/);
  const file = await fetch(base + up.data.url);
  assert.equal(file.status, 200); assert.equal(file.headers.get('content-type'), 'image/png');
  assert.equal((await api('/api/hotel/me', { method: 'PATCH', body: { logo: '/uploads/h2-0123456789abcdef.png' } })).status, 400); // another hotel's / foreign path
  assert.equal((await api('/api/hotel/me', { method: 'PATCH', body: { logo: 'https://evil.example/x.png' } })).status, 400);
  assert.equal((await api('/api/hotel/me', { method: 'PATCH', body: { logo: up.data.url } })).status, 200);
  assert.equal((await offers()).logo, up.data.url);
  const list = (await api(`/api/hotels?q=Caspian&checkIn=${day(30)}&checkOut=${day(32)}`, { token: null })).data.results;
  assert.equal(list[0].logo, up.data.url);
  const big = 'data:image/png;base64,' + Buffer.concat([Buffer.from('89504e47', 'hex'), Buffer.alloc(600 * 1024)]).toString('base64');
  assert.ok([413, 400].includes((await api('/api/hotel/upload', { method: 'POST', body: { dataUrl: big } })).status));
});

test('hotel writes about-us, services, facilities and links; shown publicly; links must be https', async () => {
  const ok = await api('/api/hotel/me', { method: 'PATCH', body: { about: 'Family run since 1998.', servicesText: 'Airport transfer\nSpa & sauna\n\nLate check-out', amenities: ['wifi', 'spa', 'bogus'], website: 'https://caspianpearl.example', instagram: 'https://instagram.com/caspianpearl' } });
  assert.equal(ok.status, 200);
  const h = await offers();
  assert.equal(h.about, 'Family run since 1998.');
  assert.deepEqual(h.services, ['Airport transfer', 'Spa & sauna', 'Late check-out']);
  assert.deepEqual(h.amenities, ['wifi', 'spa']);
  assert.equal((await api('/api/hotel/me', { method: 'PATCH', body: { website: 'javascript:alert(1)' } })).status, 400);
});

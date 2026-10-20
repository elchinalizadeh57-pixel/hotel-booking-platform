const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/app');

let server, base, ctx;
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const CI = day(30), CO = day(32);

test.before(async () => {
  ctx = createApp({ dbFile: ':memory:' });
  await new Promise((r) => { server = ctx.app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { server.close(); ctx.close(); });

async function api(path, { method = 'GET', body, token, headers = {} } = {}) {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token && { authorization: 'Bearer ' + token }), ...headers }, body: body && JSON.stringify(body) });
  return { status: r.status, data: await r.json().catch(() => null) };
}
const login = async (email, password) => (await api('/api/auth/login', { method: 'POST', body: { email, password } })).data.token;
const q = `checkIn=${CI}&checkOut=${CO}&adults=2`;
const guest = { name: 'John Doe', email: 'john@example.com' };

test('tourist sees BRUTTO, approved agency sees agency price, pending agency does not', async () => {
  const t = await api(`/api/hotels/1?${q}`);
  const agencyTok = await login('agency@hotel.local', 'Agency123!');
  const a = await api(`/api/hotels/1?${q}`, { token: agencyTok });
  const pendTok = await login('agency2@hotel.local', 'Agency123!');
  const p = await api(`/api/hotels/1?${q}`, { token: pendTok });
  const row = ctx.db.prepare('SELECT base_price FROM room_types WHERE id=1').get();
  assert.equal(t.data.offers[0].perNight, Math.round(row.base_price * 1.2 * 100) / 100);
  assert.equal(a.data.offers[0].perNight, row.base_price);
  assert.equal(p.data.offers[0].perNight, t.data.offers[0].perNight);
  assert.ok(!JSON.stringify(t.data).includes('base_price') && !JSON.stringify(t.data).toLowerCase().includes('netto'));
});

test('contract payment is blocked for tourists and pending agencies', async () => {
  const body = { roomTypeId: 1, checkIn: CI, checkOut: CO, guest, payMethod: 'contract' };
  const tok = await login('tourist@hotel.local', 'Tourist123!');
  assert.equal((await api('/api/bookings', { method: 'POST', token: tok, body })).status, 403);
  const pend = await login('agency2@hotel.local', 'Agency123!');
  assert.equal((await api('/api/bookings', { method: 'POST', token: pend, body })).status, 403);
});

test('online booking: hold → failed payment → successful payment → cancel with refund', async () => {
  const tok = await login('tourist@hotel.local', 'Tourist123!');
  const b = await api('/api/bookings', { method: 'POST', token: tok, body: { roomTypeId: 1, checkIn: CI, checkOut: CO, guest, payMethod: 'online' } });
  assert.equal(b.status, 201);
  assert.equal(b.data.status, 'on_hold');
  const bad = await api(`/api/bookings/${b.data.id}/pay`, { method: 'POST', token: tok, body: { card: { number: '4000 0000 0000 0000' } } });
  assert.equal(bad.status, 402);
  const ok = await api(`/api/bookings/${b.data.id}/pay`, { method: 'POST', token: tok, body: { card: { number: '4242424242424242' } } });
  assert.equal(ok.data.status, 'confirmed');
  const c = await api(`/api/bookings/${b.data.id}/cancel`, { method: 'POST', token: tok });
  assert.equal(c.data.status, 'refunded');
});

test('no double booking of the last room under parallel requests', async () => {
  ctx.db.prepare('UPDATE room_types SET count=1 WHERE id=2').run();
  const tok = await login('tourist@hotel.local', 'Tourist123!');
  const body = { roomTypeId: 2, checkIn: day(60), checkOut: day(61), guest, payMethod: 'online' };
  const rs = await Promise.all(Array.from({ length: 8 }, () => api('/api/bookings', { method: 'POST', token: tok, body })));
  assert.equal(rs.filter((r) => r.status === 201).length, 1);
  assert.equal(rs.filter((r) => r.status === 409).length, 7);
});

test('idempotency key prevents duplicate bookings', async () => {
  const tok = await login('tourist@hotel.local', 'Tourist123!');
  const body = { roomTypeId: 3, checkIn: day(70), checkOut: day(71), guest, payMethod: 'online' };
  const h = { 'Idempotency-Key': 'abc-123' };
  const a = await api('/api/bookings', { method: 'POST', token: tok, body, headers: h });
  const b = await api('/api/bookings', { method: 'POST', token: tok, body, headers: h });
  assert.equal(a.data.id, b.data.id);
});

test('expired hold releases inventory', async () => {
  const tok = await login('tourist@hotel.local', 'Tourist123!');
  const body = { roomTypeId: 4, checkIn: day(80), checkOut: day(81), guest, payMethod: 'online' };
  const b = await api('/api/bookings', { method: 'POST', token: tok, body });
  ctx.db.prepare("UPDATE bookings SET hold_expires='2000-01-01T00:00:00.000Z' WHERE id=?").run(b.data.id);
  await api(`/api/hotels/2?checkIn=${day(80)}&checkOut=${day(81)}`);
  assert.equal(ctx.db.prepare('SELECT status FROM bookings WHERE id=?').get(b.data.id).status, 'failed');
  assert.equal(ctx.db.prepare('SELECT available FROM inventory WHERE room_type_id=4 AND date=?').get(day(80)).available, ctx.db.prepare('SELECT count FROM room_types WHERE id=4').get().count);
});

test('agency contract booking respects credit limit and snapshot is immutable', async () => {
  const tok = await login('agency@hotel.local', 'Agency123!');
  const body = { roomTypeId: 1, checkIn: day(90), checkOut: day(92), guest, payMethod: 'contract' };
  const b = await api('/api/bookings', { method: 'POST', token: tok, body });
  assert.equal(b.data.status, 'confirmed');
  const before = ctx.db.prepare('SELECT snapshot,total_usd FROM bookings WHERE id=?').get(b.data.id);
  const adm = await login('admin@hotel.local', 'Admin123!');
  const r = await api('/api/admin/rules', { method: 'POST', token: adm, body: { kind: 'markup', scope: 'hotel', scopeRef: '1', percent: 90 } });
  assert.equal(r.status, 201);
  const after = ctx.db.prepare('SELECT snapshot,total_usd FROM bookings WHERE id=?').get(b.data.id);
  assert.deepEqual(after, before);
  ctx.db.prepare('UPDATE agencies SET credit_limit=1 WHERE id=1').run();
  assert.equal((await api('/api/bookings', { method: 'POST', token: tok, body: { ...body, checkIn: day(100), checkOut: day(101) } })).status, 402);
  // duplicate active rule → conflict
  assert.equal((await api('/api/admin/rules', { method: 'POST', token: adm, body: { kind: 'markup', scope: 'hotel', scopeRef: '1', percent: 5 } })).status, 409);
});

test('authorization: admin and hotel endpoints are role-protected', async () => {
  const tok = await login('tourist@hotel.local', 'Tourist123!');
  assert.equal((await api('/api/admin/stats', { token: tok })).status, 403);
  assert.equal((await api('/api/admin/stats')).status, 401);
  assert.equal((await api('/api/hotel/me', { token: tok })).status, 403);
  const adm = await login('admin@hotel.local', 'Admin123!');
  const st = await api('/api/admin/stats', { token: adm });
  assert.equal(st.status, 200);
  assert.ok('revenueUsd' in st.data);
});

test('hotel manager updates only own inventory', async () => {
  const tok = await login('hotel@hotel.local', 'Hotel123!');
  const ok = await api('/api/hotel/rooms/1/inventory', { method: 'PUT', token: tok, body: { from: day(120), to: day(125), available: 0 } });
  assert.equal(ok.status, 200);
  const o = await api(`/api/hotels/1?checkIn=${day(121)}&checkOut=${day(122)}`);
  assert.equal(o.data.offers.find((x) => x.id === 1).bookable, false);
  assert.equal((await api('/api/hotel/rooms/5/inventory', { method: 'PUT', token: tok, body: { from: day(120), available: 0 } })).status, 404);
});

test('registration validation and agency approval flow', async () => {
  assert.equal((await api('/api/auth/register', { method: 'POST', body: { email: 'bad', password: 'x' } })).status, 400);
  const r = await api('/api/auth/register', { method: 'POST', body: { email: 'new@ag.com', password: 'password1', type: 'agency', agency: { name: 'X Travel', voen: '111' } } });
  assert.equal(r.status, 201);
  assert.equal(r.data.user.agency.status, 'pending');
  const adm = await login('admin@hotel.local', 'Admin123!');
  await api(`/api/admin/agencies/${r.data.user.agencyId}`, { method: 'PATCH', token: adm, body: { status: 'approved', creditLimit: 1000 } });
  const me = await api('/api/me', { token: r.data.token });
  assert.equal(me.data.agency.status, 'approved');
});

test('EUR and RUB are supported display currencies', async () => {
  const usd = (await api(`/api/hotels/1?${q}&currency=USD`)).data.offers[0].perNight;
  const eur = (await api(`/api/hotels/1?${q}&currency=EUR`)).data.offers[0];
  const rub = (await api(`/api/hotels/1?${q}&currency=RUB`)).data.offers[0];
  assert.equal(eur.currency, 'EUR'); assert.equal(rub.currency, 'RUB');
  assert.equal(eur.perNight, Math.round(usd * 0.92 * 100) / 100);
  assert.equal(rub.perNight, Math.round(usd * 92 * 100) / 100);
  assert.deepEqual((await api('/api/meta')).data.currencies, ['USD', 'EUR', 'RUB', 'AZN', 'UZS']);
});

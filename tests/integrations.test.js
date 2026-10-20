const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const TOTP = require('../server/totp');
const Pay = require('../server/payments');

const calls = [];
const realFetch = globalThis.fetch;
const stubs = [];
globalThis.fetch = async (url, opt = {}) => {
  const u = String(url);
  if (u.startsWith('http://127.0.0.1')) return realFetch(url, opt);
  calls.push({ url: u, opt });
  const hit = stubs.find((s) => u.includes(s.match));
  if (hit && hit.fail) return new Response('{}', { status: 500 });
  if (u.includes('oauth2.googleapis.com')) return Response.json({ access_token: 'tok', expires_in: 3600 });
  if (u.includes('api.stripe.com')) return Response.json({ id: 'cs_test_1', url: 'https://checkout.stripe.test/c/cs_test_1' });
  return Response.json({ ok: true });
};

const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
Object.assign(process.env, {
  TELEGRAM_BOT_TOKEN: 'bot123', TELEGRAM_CHAT_ID: '-100', CRM_WEBHOOK_URL: 'https://crm.test/hook', CRM_WEBHOOK_SECRET: 'crmsecret',
  GOOGLE_SA_EMAIL: 'sa@proj.iam.gserviceaccount.com', GOOGLE_SA_KEY: privateKey, SHEETS_ID: 'sheet1',
  PAYMENT_PROVIDER: 'stripe', STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_test',
});
const { createApp } = require('../server/app');

let server, base, ctx;
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
test.before(async () => {
  ctx = createApp({ dbFile: ':memory:' });
  await new Promise((r) => { server = ctx.app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
  await ctx.suppliers.syncAll();
});
test.after(() => { server.close(); ctx.close(); globalThis.fetch = realFetch; });

async function api(path, { method = 'GET', body, token, headers = {}, raw } = {}) {
  const r = await realFetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token && { authorization: 'Bearer ' + token }), ...headers }, body: raw ?? (body && JSON.stringify(body)) });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data };
}
const login = async (email, password, code) => (await api('/api/auth/login', { method: 'POST', body: { email, password, code } })).data.token;
const guest = { name: 'Ann Lee', email: 'ann@example.com' };

test('TOTP matches RFC 6238 test vector and rejects wrong codes', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // "12345678901234567890"
  assert.equal(TOTP.code(secret, 59000), '287082');
  assert.ok(TOTP.verify(secret, '287082', 59000));
  assert.ok(!TOTP.verify(secret, '000000', 59000));
});

test('MFA: setup, enable, login requires a code', async () => {
  const tok = await login('tourist@hotel.local', 'Tourist123!');
  const s = await api('/api/auth/mfa/setup', { method: 'POST', token: tok });
  assert.match(s.data.uri, /^otpauth:\/\/totp\//);
  assert.equal((await api('/api/auth/mfa/enable', { method: 'POST', token: tok, body: { code: '000000' } })).status, 400);
  assert.equal((await api('/api/auth/mfa/enable', { method: 'POST', token: tok, body: { code: TOTP.code(s.data.secret) } })).status, 200);
  const no = await api('/api/auth/login', { method: 'POST', body: { email: 'tourist@hotel.local', password: 'Tourist123!' } });
  assert.equal(no.status, 401); assert.equal(no.data.mfaRequired, true);
  const bad = await api('/api/auth/login', { method: 'POST', body: { email: 'tourist@hotel.local', password: 'Tourist123!', code: '111111' } });
  assert.equal(bad.status, 401);
  const ok = await api('/api/auth/login', { method: 'POST', body: { email: 'tourist@hotel.local', password: 'Tourist123!', code: TOTP.code(s.data.secret) } });
  assert.equal(ok.status, 200);
  await api('/api/auth/mfa/disable', { method: 'POST', token: ok.data.token, body: { code: TOTP.code(s.data.secret, Date.now() + 30000) } });
});

test('Stripe checkout + signed webhook confirms booking once (idempotent), bad signature rejected', async () => {
  const tok = await login('tourist@hotel.local', 'Tourist123!');
  const b = await api('/api/bookings', { method: 'POST', token: tok, body: { roomTypeId: 1, checkIn: day(40), checkOut: day(42), guest, payMethod: 'online' } });
  const pay = await api(`/api/bookings/${b.data.id}/pay`, { method: 'POST', token: tok, body: {} });
  assert.match(pay.data.redirectUrl, /checkout\.stripe\.test/);
  const stripeCall = calls.find((c) => c.url.includes('api.stripe.com'));
  assert.ok(String(stripeCall.opt.body).includes('metadata%5Bbooking_id%5D=' + b.data.id));
  assert.equal(String(stripeCall.opt.headers.authorization), 'Bearer sk_test_x');

  const event = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', data: { object: { payment_status: 'paid', metadata: { booking_id: String(b.data.id) } } } });
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', 'whsec_test').update(`${t}.${event}`).digest('hex');
  const bad = await api('/api/webhooks/stripe', { method: 'POST', raw: event, headers: { 'stripe-signature': `t=${t},v1=${'0'.repeat(64)}` } });
  assert.equal(bad.status, 400);
  assert.equal(ctx.db.prepare('SELECT status FROM bookings WHERE id=?').get(b.data.id).status, 'on_hold');
  const ok = await api('/api/webhooks/stripe', { method: 'POST', raw: event, headers: { 'stripe-signature': `t=${t},v1=${sig}` } });
  assert.equal(ok.status, 200);
  assert.equal(ctx.db.prepare('SELECT status FROM bookings WHERE id=?').get(b.data.id).status, 'confirmed');
  const dup = await api('/api/webhooks/stripe', { method: 'POST', raw: event, headers: { 'stripe-signature': `t=${t},v1=${sig}` } });
  assert.equal(dup.data.duplicate, true);
  assert.equal(ctx.db.prepare("SELECT COUNT(*) n FROM payments WHERE booking_id=? AND status='paid'").get(b.data.id).n, 1);
  assert.ok(!Pay.verifyStripeSignature(event, `t=${t - 1000},v1=${sig}`, 'whsec_test'));
});

test('outbox delivers Telegram (no PII), signed CRM, Google Sheets; retries then fails and can be retried', async () => {
  calls.length = 0;
  await ctx.outbox.process();
  const tg = calls.find((c) => c.url.includes('api.telegram.org/botbot123/sendMessage'));
  assert.ok(tg, 'telegram call');
  assert.ok(!tg.opt.body.includes('ann@example.com') && !tg.opt.body.includes('Ann Lee'));
  const crm = calls.find((c) => c.url === 'https://crm.test/hook');
  assert.equal(crm.opt.headers['x-signature'], crypto.createHmac('sha256', 'crmsecret').update(crm.opt.body).digest('hex'));
  const sh = calls.find((c) => c.url.includes('sheets.googleapis.com'));
  assert.ok(sh && sh.opt.headers.authorization === 'Bearer tok');
  assert.ok(!sh.opt.body.includes('ann@example.com'));
  assert.equal(ctx.db.prepare("SELECT COUNT(*) n FROM outbox WHERE status='done'").get().n >= 3, true);

  // failure path: backoff, error log, final failure, manual retry
  stubs.push({ match: 'api.telegram.org', fail: true });
  ctx.outbox.enqueue('telegram', 'tg:test:1', { text: 'x' });
  for (let i = 0; i < 5; i++) {
    ctx.db.prepare("UPDATE outbox SET next_at='2000-01-01' WHERE dedupe='tg:test:1'").run();
    await ctx.outbox.process();
  }
  const row = ctx.db.prepare("SELECT * FROM outbox WHERE dedupe='tg:test:1'").get();
  assert.equal(row.status, 'failed'); assert.equal(row.attempts, 5); assert.match(row.error, /Telegram 500/);
  stubs.length = 0;
  ctx.outbox.retry(row.id);
  await ctx.outbox.process();
  assert.equal(ctx.db.prepare('SELECT status FROM outbox WHERE id=?').get(row.id).status, 'done');
});

test('outbox dedupes: same event is not queued twice', () => {
  const a = ctx.db.prepare('SELECT COUNT(*) n FROM outbox').get().n;
  ctx.outbox.enqueue('telegram', 'tg:test:1', { text: 'dup' });
  assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM outbox').get().n, a);
});

test('supplier hotels are imported, bookable, confirmed by supplier, cancelled at supplier', async () => {
  const hs = await api(`/api/hotels?q=Istanbul&checkIn=${day(30)}&checkOut=${day(32)}`);
  assert.equal(hs.data.results.length, 2);
  const tok = await login('agency@hotel.local', 'Agency123!');
  const rt = ctx.db.prepare("SELECT id FROM room_types WHERE external_id='IST-1-A'").get().id;
  const b = await api('/api/bookings', { method: 'POST', token: tok, body: { roomTypeId: rt, checkIn: day(30), checkOut: day(32), guest, payMethod: 'contract' } });
  assert.equal(b.status, 201); assert.equal(b.data.status, 'confirmed');
  assert.match(ctx.db.prepare('SELECT external_ref FROM bookings WHERE id=?').get(b.data.id).external_ref, /^MOCK-/);
  const c = await api(`/api/bookings/${b.data.id}/cancel`, { method: 'POST', token: tok });
  assert.equal(c.data.status, 'cancelled');
});

test('supplier rejection releases inventory and debt, booking fails', async () => {
  const tok = await login('agency@hotel.local', 'Agency123!');
  const rt = ctx.db.prepare("SELECT id FROM room_types WHERE external_id='IST-1-B'").get().id;
  const debtBefore = ctx.db.prepare('SELECT debt FROM agencies WHERE id=1').get().debt;
  const r = await api('/api/bookings', { method: 'POST', token: tok, body: { roomTypeId: rt, checkIn: day(50), checkOut: day(51), guest: { name: 'FAIL Test', email: 'f@x.com' }, payMethod: 'contract' } });
  assert.equal(r.status, 502);
  assert.equal(ctx.db.prepare('SELECT debt FROM agencies WHERE id=1').get().debt, debtBefore);
  assert.equal(ctx.db.prepare('SELECT available FROM inventory WHERE room_type_id=? AND date=?').get(rt, day(50)).available, 2);
  assert.equal(ctx.db.prepare("SELECT status FROM bookings WHERE room_type_id=? ORDER BY id DESC").get(rt).status, 'failed');
});

test('currency rates are editable by admin and recorded in history', async () => {
  const adm = await login('admin@hotel.local', 'Admin123!');
  assert.equal((await api('/api/admin/rates', { method: 'PUT', token: adm, body: { AZN: -1 } })).status, 400);
  const r = await api('/api/admin/rates', { method: 'PUT', token: adm, body: { AZN: 1.8 } });
  assert.equal(r.data.rates.AZN, 1.8);
  const i = await api('/api/admin/integrations', { token: adm });
  assert.equal(i.data.ratesHistory[0].currency, 'AZN');
  assert.equal(i.data.outbox.channels.telegram, true);
  assert.equal((await api('/api/admin/integrations', { token: await login('hotel@hotel.local', 'Hotel123!') })).status, 403);
});

test('SEO: hotel page with JSON-LD, sitemap, robots; CMS page editable by admin', async () => {
  const h = await api('/h/1');
  assert.match(h.data, /<title>Caspian Pearl Hotel/); assert.match(h.data, /application\/ld\+json/); assert.match(h.data, /rel="canonical"/);
  assert.match((await api('/sitemap.xml')).data, /<loc>[^<]*\/h\/1<\/loc>/);
  assert.match((await api('/robots.txt')).data, /Sitemap:/);
  const adm = await login('admin@hotel.local', 'Admin123!');
  await api('/api/admin/pages/about/az', { method: 'PUT', token: adm, body: { title: 'Haqqımızda', body: 'Mətn' } });
  assert.equal((await api('/api/pages/about?lang=az')).data.title, 'Haqqımızda');
  assert.equal((await api('/api/pages/about?lang=ru')).data.title, 'About Stayly');
});

test('REQUIRE_ADMIN_MFA blocks admin without MFA', async () => {
  process.env.REQUIRE_ADMIN_MFA = '1';
  const adm = await login('admin@hotel.local', 'Admin123!');
  const r = await api('/api/admin/stats', { token: adm });
  assert.equal(r.status, 403);
  delete process.env.REQUIRE_ADMIN_MFA;
});

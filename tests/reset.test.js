const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/app');

let server, base, ctx;
const logs = [];
const realLog = console.log;
test.before(async () => {
  console.log = (...a) => logs.push(a.join(' '));
  ctx = createApp({ dbFile: ':memory:' });
  await new Promise((r) => { server = ctx.app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { console.log = realLog; server.close(); ctx.close(); });

const api = async (path, body, token) => {
  const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(token && { authorization: 'Bearer ' + token }) }, body: body && JSON.stringify(body) });
  return { status: r.status, data: await r.json().catch(() => null) };
};

test('password reset: same answer for unknown e-mail, token is single-use, old sessions and password stop working', async () => {
  const unknown = await api('/api/auth/forgot', { email: 'nobody@example.com' });
  assert.equal(unknown.status, 200);
  assert.equal(logs.filter((l) => l.includes('reset link')).length, 0);

  const old = (await api('/api/auth/login', { email: 'tourist@hotel.local', password: 'Tourist123!' })).data.token;
  assert.equal((await api('/api/me', null, old)).status, 200);

  assert.equal((await api('/api/auth/forgot', { email: 'tourist@hotel.local' })).status, 200);
  const line = logs.find((l) => l.includes('reset link for tourist@hotel.local'));
  const token = line.match(/token=([\w-]+)/)[1];
  assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM password_resets WHERE token_hash=?').get(token).n, 0, 'raw token must not be stored');

  assert.equal((await api('/api/auth/reset', { token: 'bad', password: 'NewPassw0rd!' })).status, 400);
  assert.equal((await api('/api/auth/reset', { token, password: 'short' })).status, 400);
  await new Promise((r) => setTimeout(r, 1100)); // iat/pw_changed_at have 1 s resolution
  assert.equal((await api('/api/auth/reset', { token, password: 'NewPassw0rd!' })).status, 200);
  assert.equal((await api('/api/auth/reset', { token, password: 'AnotherPass1!' })).status, 400, 'single use');

  assert.equal((await api('/api/auth/login', { email: 'tourist@hotel.local', password: 'Tourist123!' })).status, 401);
  assert.equal((await api('/api/auth/login', { email: 'tourist@hotel.local', password: 'NewPassw0rd!' })).status, 200);
  assert.equal((await api('/api/me', null, old)).status, 401, 'old session invalidated');
});

test('expired reset token is rejected', async () => {
  await api('/api/auth/forgot', { email: 'admin@hotel.local' });
  const token = logs.filter((l) => l.includes('reset link for admin@hotel.local')).pop().match(/token=([\w-]+)/)[1];
  ctx.db.prepare("UPDATE password_resets SET expires_at='2000-01-01T00:00:00.000Z'").run();
  assert.equal((await api('/api/auth/reset', { token, password: 'NewPassw0rd!' })).status, 400);
});

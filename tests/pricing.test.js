const test = require('node:test');
const assert = require('node:assert/strict');
const { nightPrice, quoteStay, findConflict } = require('../server/pricing');

const rule = (o) => ({ id: 1, active: 1, kind: 'markup', scope: 'platform', scope_ref: null, percent: 25, date_from: null, date_to: null, ...o });
const ctx = { date: '2030-01-10', country: 'Azerbaijan', hotelId: 1, roomId: 1, agencyId: null };

test('NETTO 80 + 25% markup = 100 for tourist, netto for agency', () => {
  const rules = [rule({})];
  assert.equal(nightPrice({ base: 80, model: 'netto', role: 'public', rules, ctx }).price, 100);
  assert.equal(nightPrice({ base: 80, model: 'netto', role: 'agency', rules, ctx }).price, 80);
});
test('NETTO with 0% / no rule', () => {
  assert.equal(nightPrice({ base: 80, model: 'netto', role: 'public', rules: [], ctx }).price, 80);
});
test('BRUTTO 100 - 20% agency discount = 80; tourist pays 100', () => {
  const rules = [rule({ kind: 'agency_discount', percent: 20 })];
  assert.equal(nightPrice({ base: 100, model: 'brutto', role: 'agency', rules, ctx }).price, 80);
  assert.equal(nightPrice({ base: 100, model: 'brutto', role: 'public', rules, ctx }).price, 100);
  assert.equal(nightPrice({ base: 100, model: 'brutto', role: 'agency', rules: [], ctx }).price, 100);
});
test('more specific rule wins; date ranges respected', () => {
  const rules = [rule({ id: 1, percent: 10 }), rule({ id: 2, scope: 'hotel', scope_ref: '1', percent: 30 }),
    rule({ id: 3, scope: 'room', scope_ref: '1', percent: 50, date_from: '2030-02-01', date_to: '2030-02-28' })];
  assert.equal(nightPrice({ base: 100, model: 'netto', role: 'public', rules, ctx }).price, 130);
  assert.equal(nightPrice({ base: 100, model: 'netto', role: 'public', rules, ctx: { ...ctx, date: '2030-02-10' } }).price, 150);
});
test('markup is applied once only, rounding to 2 decimals', () => {
  const rules = [rule({ percent: 12.5 })];
  assert.equal(nightPrice({ base: 33.33, model: 'netto', role: 'public', rules, ctx }).price, 37.5);
});
test('conflicting active rules are detected', () => {
  const existing = [rule({ date_from: '2030-01-01', date_to: '2030-03-01' })];
  assert.ok(findConflict(existing, { kind: 'markup', scope: 'platform', scope_ref: null, date_from: '2030-02-01', date_to: null }));
  assert.ok(!findConflict(existing, { kind: 'markup', scope: 'platform', scope_ref: null, date_from: '2030-04-01', date_to: null }));
  assert.ok(!findConflict(existing, { kind: 'commission', scope: 'platform', scope_ref: null }));
});
test('quote splits hotel payable and platform revenue', () => {
  const hotel = { id: 1, country: 'Azerbaijan', price_model: 'netto' };
  const q = quoteStay({ hotel, roomId: 1, nights: [{ date: '2030-01-10', base: 80 }, { date: '2030-01-11', base: 80 }], rooms: 2, role: 'public', rules: [rule({})] });
  assert.equal(q.total, 400);
  assert.equal(q.hotelPayable, 320);
  assert.equal(q.revenue, 80);
  const hb = { ...hotel, price_model: 'brutto' };
  const q2 = quoteStay({ hotel: hb, roomId: 1, nights: [{ date: '2030-01-10', base: 100 }], rooms: 1, role: 'public', rules: [rule({ kind: 'commission', percent: 12 })] });
  assert.equal(q2.total, 100);
  assert.equal(q2.hotelPayable, 88);
  assert.equal(q2.revenue, 12);
});

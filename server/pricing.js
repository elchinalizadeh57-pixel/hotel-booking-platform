// NETTO/BRUTTO pricing engine. Pure functions, all calculation is server-side.
// NETTO model:  public = netto * (1 + markup/100);  agency = netto
// BRUTTO model: public = brutto;                    agency = brutto * (1 - discount/100)
// Rule specificity: agency > room > hotel > country > platform. Newest rule wins ties
// (conflicts are rejected when a rule is created, see findConflict).

const SCOPE_ORDER = { agency: 5, room: 4, hotel: 3, country: 2, platform: 1 };
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const RATES = { USD: 1, AZN: 1.7, UZS: 12600 };
const CURRENCIES = Object.keys(RATES);
function setRates(r) { for (const k of Object.keys(r)) if (r[k] > 0) RATES[k] = r[k]; RATES.USD = 1; }
function convert(usd, cur) {
  const r = RATES[cur] || 1;
  return cur === 'UZS' ? Math.round(usd * r) : round2(usd * r);
}

function ruleMatches(r, ctx) {
  if (!r.active) return false;
  if (r.date_from && ctx.date < r.date_from) return false;
  if (r.date_to && ctx.date > r.date_to) return false;
  switch (r.scope) {
    case 'platform': return true;
    case 'country': return r.scope_ref === ctx.country;
    case 'hotel': return Number(r.scope_ref) === ctx.hotelId;
    case 'room': return Number(r.scope_ref) === ctx.roomId;
    case 'agency': return ctx.agencyId != null && Number(r.scope_ref) === ctx.agencyId;
  }
  return false;
}

function pickRule(rules, kind, ctx) {
  const c = rules.filter((r) => r.kind === kind && ruleMatches(r, ctx));
  if (!c.length) return null;
  c.sort((a, b) => SCOPE_ORDER[b.scope] - SCOPE_ORDER[a.scope] || b.id - a.id);
  return c[0];
}

// Two active rules of same kind/scope/ref with overlapping dates are ambiguous.
function findConflict(rules, nr) {
  const lo = (d) => d || '0000-01-01';
  const hi = (d) => d || '9999-12-31';
  return rules.find((r) => r.active && r.kind === nr.kind && r.scope === nr.scope &&
    String(r.scope_ref ?? '') === String(nr.scope_ref ?? '') &&
    lo(r.date_from) <= hi(nr.date_to) && lo(nr.date_from) <= hi(r.date_to));
}

/** Price of one night for the given viewer role ('public' | 'agency'). */
function nightPrice({ base, model, role, rules, ctx }) {
  const used = [];
  let price;
  if (model === 'netto') {
    if (role === 'agency') price = base;
    else {
      const m = pickRule(rules, 'markup', ctx);
      if (m) used.push(m.id);
      price = base * (1 + (m ? m.percent : 0) / 100);
    }
  } else if (role === 'agency') {
    const d = pickRule(rules, 'agency_discount', ctx);
    if (d) used.push(d.id);
    price = base * (1 - (d ? d.percent : 0) / 100);
  } else price = base;
  return { price: round2(price), rules: used };
}

/**
 * Full quote for a stay. `nights` = [{date, base}] (hotel-submitted price per night, USD, per room).
 * Returns the amount charged, hotel payable and platform revenue plus an immutable snapshot.
 */
function quoteStay({ hotel, roomId, nights, rooms, role, agencyId, rules }) {
  const lines = [];
  const ruleIds = new Set();
  let total = 0, netTotal = 0;
  for (const n of nights) {
    const ctx = { date: n.date, country: hotel.country, hotelId: hotel.id, roomId, agencyId };
    const p = nightPrice({ base: n.base, model: hotel.price_model, role, rules, ctx });
    p.rules.forEach((i) => ruleIds.add(i));
    lines.push({ date: n.date, base: n.base, price: p.price });
    total += p.price * rooms;
    netTotal += n.base * rooms;
  }
  total = round2(total);
  netTotal = round2(netTotal);
  let hotelPayable = netTotal;
  if (hotel.price_model === 'brutto') {
    const ctx = { date: nights[0].date, country: hotel.country, hotelId: hotel.id, roomId };
    const c = pickRule(rules, 'commission', ctx);
    if (c) ruleIds.add(c.id);
    hotelPayable = round2(netTotal * (1 - (c ? c.percent : 0) / 100));
  }
  return {
    total, hotelPayable, revenue: round2(total - hotelPayable),
    snapshot: {
      model: hotel.price_model, role, rooms, nights: lines, baseTotal: netTotal, tax: 0,
      hotelPayable, platformRevenue: round2(total - hotelPayable), ruleIds: [...ruleIds],
    },
  };
}

module.exports = { setRates, round2, convert, RATES, CURRENCIES, nightPrice, quoteStay, pickRule, findConflict };

const express = require('express');
const path = require('path');
const { openDb } = require('./db');
const { seed } = require('./seed');
const A = require('./auth');
const P = require('./pricing');
const TOTP = require('./totp');
const Pay = require('./payments');
const { createOutbox } = require('./integrations/outbox');
const { createSuppliers } = require('./suppliers');

const HOLD_MIN = 15;
const TRANSITIONS = {
  draft: ['on_hold', 'cancelled'], pending: ['confirmed', 'rejected', 'cancelled'],
  on_hold: ['confirmed', 'failed', 'cancelled'], confirmed: ['cancelled', 'refunded', 'partially_refunded'],
  cancelled: ['refunded', 'partially_refunded'], partially_refunded: ['refunded'],
};
const today = () => new Date().toISOString().slice(0, 10);
const J = (s, d = []) => { try { return JSON.parse(s); } catch { return d; } };

function createApp({ dbFile = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'hotel.db') } = {}) {
  const db = openDb(dbFile);
  if (!db.prepare('SELECT 1 FROM users LIMIT 1').get()) seed(db);
  const secret = A.loadSecret(dbFile);
  const outbox = createOutbox(db);
  const suppliers = createSuppliers(db);
  suppliers.ensureDefaults();
  const savedRates = db.prepare('SELECT currency, per_usd FROM currency_rates WHERE id IN (SELECT MAX(id) FROM currency_rates GROUP BY currency)').all();
  P.setRates(Object.fromEntries(savedRates.map((r) => [r.currency, r.per_usd])));
  const nn = (p) => p.map((x) => (x === undefined ? null : x));
  const get = (sql, ...p) => db.prepare(sql).get(...nn(p));
  const all = (sql, ...p) => db.prepare(sql).all(...nn(p));
  const run = (sql, ...p) => db.prepare(sql).run(...nn(p));
  const tx = (fn) => {
    db.exec('BEGIN IMMEDIATE');
    try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
  };
  const audit = (uid, action, detail) => run('INSERT INTO audit_logs(user_id,action,detail) VALUES(?,?,?)', uid, action, typeof detail === 'string' ? detail : JSON.stringify(detail));
  const notify = (uid, text) => uid && run('INSERT INTO notifications(user_id,text) VALUES(?,?)', uid, text);
  const fail = (status, message) => Object.assign(new Error(message), { status });

  // ---------- dates / inventory ----------
  function nightsList(ci, co) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ci || '') || !/^\d{4}-\d{2}-\d{2}$/.test(co || '')) throw fail(400, 'Invalid dates');
    const out = [];
    for (let d = new Date(ci + 'T00:00:00Z'), end = new Date(co + 'T00:00:00Z'); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
      out.push(d.toISOString().slice(0, 10));
      if (out.length > 30) throw fail(400, 'Maximum stay is 30 nights');
    }
    if (!out.length) throw fail(400, 'Check-out must be after check-in');
    if (ci < today()) throw fail(400, 'Check-in is in the past');
    return out;
  }
  function invMap(roomId, dates) {
    const rows = all('SELECT date,available,price,closed FROM inventory WHERE room_type_id=? AND date>=? AND date<=?', roomId, dates[0], dates[dates.length - 1]);
    return new Map(rows.map((r) => [r.date, r]));
  }
  function roomOffer(rt, dates, rooms) {
    const inv = invMap(rt.id, dates);
    let min = Infinity;
    const nights = dates.map((date) => {
      const r = inv.get(date) || { available: rt.count, price: null, closed: 0 };
      min = Math.min(min, r.closed ? 0 : r.available);
      return { date, base: r.price ?? rt.base_price };
    });
    return { nights, available: min, ok: min >= rooms };
  }
  function releaseInventory(b) {
    for (const date of nightsList2(b.check_in, b.check_out)) {
      run('UPDATE inventory SET available=available+? WHERE room_type_id=? AND date=?', b.rooms, b.room_type_id, date);
    }
  }
  function nightsList2(ci, co) {
    const out = [];
    for (let d = new Date(ci + 'T00:00:00Z'), end = new Date(co + 'T00:00:00Z'); d < end; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
    return out;
  }
  function setStatus(b, status, note, uid) {
    run('UPDATE bookings SET status=? WHERE id=?', status, b.id);
    run('INSERT INTO booking_history(booking_id,status,note) VALUES(?,?,?)', b.id, status, note || '');
    audit(uid, 'booking.' + status, { ref: b.ref, note });
  }
  function expireHolds() {
    const now = new Date().toISOString();
    for (const b of all("SELECT * FROM bookings WHERE status='on_hold' AND hold_expires < ?", now)) {
      tx(() => { releaseInventory(b); setStatus(b, 'failed', 'Hold expired'); });
    }
  }
  const rulesNow = () => all('SELECT * FROM pricing_rules WHERE active=1');

  // ---------- serializers ----------
  const publicHotel = (h) => ({
    id: h.id, name: h.name, country: h.country, city: h.city, address: h.address, lat: h.lat, lng: h.lng, stars: h.stars,
    description: h.description, images: J(h.images), amenities: J(h.amenities), meal: h.meal, checkin: h.checkin, checkout: h.checkout,
    cancelPolicy: h.cancel_policy, website: h.website, instagram: h.instagram, rating: h.rating,
  });
  function viewerRole(user) {
    if (user?.role === 'agency' && user.agency_id) {
      const ag = get('SELECT * FROM agencies WHERE id=?', user.agency_id);
      if (ag?.status === 'approved') return { role: 'agency', agencyId: ag.id, agency: ag };
    }
    return { role: 'public', agencyId: null };
  }
  function serializeBooking(b, viewer) {
    const snap = J(b.snapshot, {});
    const h = get('SELECT name,city FROM hotels WHERE id=?', b.hotel_id);
    const rt = get('SELECT name FROM room_types WHERE id=?', b.room_type_id);
    const out = {
      id: b.id, ref: b.ref, hotel: h?.name, city: h?.city, hotelId: b.hotel_id, room: rt?.name, checkIn: b.check_in, checkOut: b.check_out,
      rooms: b.rooms, adults: b.adults, children: b.children, guest: { name: b.guest_name, email: b.guest_email, phone: b.guest_phone },
      status: b.status, payMethod: b.pay_method, channel: b.channel, total: b.total_cur, currency: b.currency, holdExpires: b.hold_expires,
      roomNumber: b.room_number, createdAt: b.created_at, nights: snap.nights?.length,
    };
    if (viewer === 'admin') Object.assign(out, { totalUsd: b.total_usd, snapshot: snap, history: all('SELECT status,note,at FROM booking_history WHERE booking_id=? ORDER BY id', b.id) });
    if (viewer === 'hotel') out.hotelPayableUsd = snap.hotelPayable;
    return out;
  }

  // ---------- app ----------
  const wrap = (fn) => (req, res, next) => { try { Promise.resolve(fn(req, res)).catch(next); } catch (e) { next(e); } };
  const app = express();
  app.disable('x-powered-by');
  // Payment provider webhook: needs the raw body for signature verification, so it is mounted before express.json.
  app.post('/api/webhooks/stripe', express.raw({ type: '*/*', limit: '200kb' }), wrap(async (req, res) => {
    const raw = req.body.toString('utf8');
    if (!Pay.verifyStripeSignature(raw, req.get('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET)) throw fail(400, 'Invalid signature');
    const ev = JSON.parse(raw);
    if (run('INSERT OR IGNORE INTO webhook_events(id,provider) VALUES(?,?)', ev.id, 'stripe').changes === 0) return res.json({ received: true, duplicate: true });
    if (ev.type === 'checkout.session.completed' && ev.data?.object?.payment_status === 'paid') {
      const b = get('SELECT * FROM bookings WHERE id=?', Number(ev.data.object.metadata?.booking_id));
      if (b && b.status === 'on_hold') {
        run('INSERT INTO payments(booking_id,amount_usd,status,last4) VALUES(?,?,?,?)', b.id, b.total_usd, 'paid', 'stripe');
        await finalizeBooking(b, 'Paid online (Stripe)');
      }
    }
    res.json({ received: true });
  }));
  app.use(express.json({ limit: '100kb' }));
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin' });
    const t = (req.get('authorization') || '').replace(/^Bearer /, '');
    const p = t && A.verify(t, secret);
    req.user = p ? get('SELECT * FROM users WHERE id=?', p.uid) : null;
    if (req.user && (req.user.pw_changed_at || 0) > p.iat) req.user = null; // password changed: older sessions are invalid
    next();
  });
  const need = (...roles) => (req, res, next) => {
    if (!req.user) return next(fail(401, 'Login required'));
    if (roles.length && !roles.includes(req.user.role)) return next(fail(403, 'Forbidden'));
    next();
  };
  const userOut = (u) => {
    const o = { id: u.id, email: u.email, name: u.name, role: u.role, agencyId: u.agency_id, hotelId: u.hotel_id, mfa: !!u.mfa_enabled };
    if (u.agency_id) { const a = get('SELECT name,status,credit_limit,debt FROM agencies WHERE id=?', u.agency_id); o.agency = { name: a.name, status: a.status, creditLimit: a.credit_limit, debt: a.debt }; }
    return o;
  };

  // --- auth
  const attempts = new Map();
  app.post('/api/auth/register', wrap((req, res) => {
    const { email, password, name, phone, type = 'tourist', agency, hotel } = req.body || {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email || '')) throw fail(400, 'Invalid email');
    if (!password || password.length < 8) throw fail(400, 'Password must be at least 8 characters');
    if (!['tourist', 'agency', 'hotel'].includes(type)) throw fail(400, 'Invalid account type');
    if (get('SELECT 1 FROM users WHERE email=?', email.toLowerCase())) throw fail(409, 'Email already registered');
    const uid = tx(() => {
      let agencyId = null;
      if (type === 'agency') {
        if (!agency?.name) throw fail(400, 'Agency name is required');
        agencyId = Number(run('INSERT INTO agencies(name,voen,country,contact) VALUES(?,?,?,?)', agency.name, agency.voen || '', agency.country || '', phone || '').lastInsertRowid);
      }
      const id = Number(run('INSERT INTO users(email,name,phone,pass,role,agency_id) VALUES(?,?,?,?,?,?)', email.toLowerCase(), name || '', phone || '', A.hashPassword(password), type, agencyId).lastInsertRowid);
      if (type === 'hotel') {
        if (!hotel?.hotelId && !hotel?.name) throw fail(400, 'Select an existing hotel or provide a new hotel name');
        run('INSERT INTO hotel_claims(user_id,hotel_id,new_name,city,country,note) VALUES(?,?,?,?,?,?)', id, hotel.hotelId || null, hotel.name || null, hotel.city || '', hotel.country || '', hotel.note || '');
      }
      audit(id, 'user.register', { type });
      return id;
    });
    res.status(201).json({ token: A.sign({ uid }, secret), user: userOut(get('SELECT * FROM users WHERE id=?', uid)) });
  }));
  app.post('/api/auth/login', wrap((req, res) => {
    const key = req.ip, now = Date.now();
    const a = (attempts.get(key) || []).filter((t) => now - t < 300000);
    if (a.length >= 10) throw fail(429, 'Too many attempts, try again later');
    const u = get('SELECT * FROM users WHERE email=?', String(req.body?.email || '').toLowerCase());
    if (!u || !A.verifyPassword(String(req.body?.password || ''), u.pass)) {
      attempts.set(key, [...a, now]);
      throw fail(401, 'Invalid email or password');
    }
    if (u.mfa_enabled) {
      if (!req.body?.code) return res.status(401).json({ error: 'Authentication code required', mfaRequired: true });
      if (!TOTP.verify(u.mfa_secret, req.body.code)) { attempts.set(key, [...a, now]); throw fail(401, 'Invalid authentication code'); }
    }
    res.json({ token: A.sign({ uid: u.id }, secret), user: userOut(u) });
  }));
  // --- password reset by e-mail (token is random, only its hash is stored, single use, 1 hour)
  const resetAttempts = new Map();
  app.post('/api/auth/forgot', wrap((req, res) => {
    const now = Date.now(), key = req.ip;
    const a = (resetAttempts.get(key) || []).filter((x) => now - x < 3600000);
    if (a.length >= 5) throw fail(429, 'Too many requests, try again later');
    resetAttempts.set(key, [...a, now]);
    const u = get('SELECT * FROM users WHERE email=?', String(req.body?.email || '').toLowerCase());
    if (u) {
      const token = require('crypto').randomBytes(32).toString('base64url');
      const hash = require('crypto').createHash('sha256').update(token).digest('hex');
      run('INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES(?,?,?)', hash, u.id, new Date(now + 3600000).toISOString());
      const link = `${process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`}/#/reset?token=${token}`;
      const sent = outbox.enqueue('email', 'email:reset:' + hash, { to: u.email, subject: 'Stayly: password reset', text: `Hello ${u.name || ''},\n\nReset your password (valid for 1 hour):\n${link}\n\nIf you did not request this, ignore this message.` });
      if (!sent) console.log(`[password reset] SMTP is not configured; reset link for ${u.email}: ${link}`);
      audit(u.id, 'password.reset.request', {});
    }
    res.json({ ok: true }); // same answer whether or not the account exists
  }));
  app.post('/api/auth/reset', wrap((req, res) => {
    const { token, password } = req.body || {};
    if (!password || password.length < 8) throw fail(400, 'Password must be at least 8 characters');
    const hash = require('crypto').createHash('sha256').update(String(token || '')).digest('hex');
    const r = get('SELECT * FROM password_resets WHERE token_hash=?', hash);
    if (!r || r.used || r.expires_at < new Date().toISOString()) throw fail(400, 'This reset link is invalid or has expired');
    tx(() => {
      run('UPDATE users SET pass=?, pw_changed_at=? WHERE id=?', A.hashPassword(password), Math.floor(Date.now() / 1000), r.user_id);
      run('UPDATE password_resets SET used=1 WHERE user_id=?', r.user_id);
      audit(r.user_id, 'password.reset.done', {});
    });
    res.json({ ok: true });
  }));
  app.post('/api/auth/mfa/setup', need(), (req, res) => {
    const sec = TOTP.newSecret();
    run('UPDATE users SET mfa_secret=?, mfa_enabled=0 WHERE id=?', sec, req.user.id);
    res.json({ secret: sec, uri: TOTP.uri(sec, req.user.email) });
  });
  app.post('/api/auth/mfa/enable', need(), wrap((req, res) => {
    if (!req.user.mfa_secret || !TOTP.verify(req.user.mfa_secret, req.body?.code)) throw fail(400, 'Invalid code');
    run('UPDATE users SET mfa_enabled=1 WHERE id=?', req.user.id);
    audit(req.user.id, 'mfa.enable', {});
    res.json({ ok: true });
  }));
  app.post('/api/auth/mfa/disable', need(), wrap((req, res) => {
    if (!req.user.mfa_enabled || !TOTP.verify(req.user.mfa_secret, req.body?.code)) throw fail(400, 'Invalid code');
    run('UPDATE users SET mfa_enabled=0, mfa_secret=NULL WHERE id=?', req.user.id);
    audit(req.user.id, 'mfa.disable', {});
    res.json({ ok: true });
  }));
  app.get('/api/me', need(), (req, res) => res.json(userOut(req.user)));
  app.get('/api/notifications', need(), (req, res) => res.json(all('SELECT id,text,at FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 30', req.user.id)));
  app.get('/api/meta', (req, res) => res.json({
    currencies: P.CURRENCIES, rates: P.RATES,
    cities: all("SELECT city,country,COUNT(*) n FROM hotels WHERE status='approved' GROUP BY city,country ORDER BY n DESC"),
    hotelsForClaim: all("SELECT id,name,city FROM hotels WHERE status='approved' ORDER BY name"),
  }));
  app.post('/api/track', (req, res) => {
    const t = String(req.body?.type || '').slice(0, 30);
    if (t) run('INSERT INTO analytics_events(type,ref) VALUES(?,?)', t, String(req.body?.ref || '').slice(0, 100));
    res.json({ ok: true });
  });

  // --- search & hotels
  function parseStay(q) {
    const rooms = Math.max(1, Math.min(9, parseInt(q.rooms) || 1));
    const adults = Math.max(1, Math.min(20, parseInt(q.adults) || 2));
    const children = Math.max(0, Math.min(10, parseInt(q.children) || 0));
    const cur = P.CURRENCIES.includes(q.currency) ? q.currency : 'USD';
    return { rooms, adults, children, cur };
  }
  function offersFor(h, dates, stay, v, rules) {
    const rts = all('SELECT * FROM room_types WHERE hotel_id=? ORDER BY base_price', h.id);
    return rts.map((rt) => {
      const o = roomOffer(rt, dates, stay.rooms);
      const fits = rt.max_guests * stay.rooms >= stay.adults + stay.children;
      const q = P.quoteStay({ hotel: h, roomId: rt.id, nights: o.nights, rooms: stay.rooms, role: v.role, agencyId: v.agencyId, rules });
      return {
        id: rt.id, name: rt.name, maxGuests: rt.max_guests, bed: rt.bed, area: rt.area, amenities: J(rt.amenities), image: rt.image,
        available: Math.min(o.available, 99), bookable: o.ok && fits, fits,
        perNight: P.convert(q.total / dates.length / stay.rooms, stay.cur), total: P.convert(q.total, stay.cur), currency: stay.cur,
        priceType: v.role === 'agency' ? 'agency' : 'public',
      };
    });
  }
  app.get('/api/hotels', wrap((req, res) => {
    expireHolds();
    const q = req.query, stay = parseStay(q), v = viewerRole(req.user), rules = rulesNow();
    const dates = q.checkIn && q.checkOut ? nightsList(q.checkIn, q.checkOut) : nightsList(today(), new Date(Date.now() + 864e5).toISOString().slice(0, 10));
    const term = String(q.q || '').trim().toLowerCase();
    let hs = all("SELECT * FROM hotels WHERE status='approved'");
    if (term) hs = hs.filter((h) => [h.name, h.city, h.country].some((x) => x.toLowerCase().includes(term)));
    if (q.stars) hs = hs.filter((h) => h.stars >= Number(q.stars));
    if (q.meal) hs = hs.filter((h) => h.meal === q.meal);
    const am = [].concat(q.amenity || []).filter(Boolean);
    if (am.length) hs = hs.filter((h) => am.every((a) => J(h.amenities).includes(a)));
    let out = hs.map((h) => {
      const offers = offersFor(h, dates, stay, v, rules).filter((o) => o.bookable);
      if (!offers.length) return null;
      const best = offers.reduce((a, b) => (a.perNight <= b.perNight ? a : b));
      return { ...publicHotel(h), image: J(h.images)[0], fromPrice: best.perNight, total: best.total, currency: stay.cur, priceType: v.role === 'agency' ? 'agency' : 'public', roomsLeft: best.available };
    }).filter(Boolean);
    const lo = parseFloat(q.minPrice), hi = parseFloat(q.maxPrice);
    if (!isNaN(lo)) out = out.filter((h) => h.fromPrice >= lo);
    if (!isNaN(hi)) out = out.filter((h) => h.fromPrice <= hi);
    const sorts = { price: (a, b) => a.fromPrice - b.fromPrice, priceDesc: (a, b) => b.fromPrice - a.fromPrice, rating: (a, b) => b.rating - a.rating, stars: (a, b) => b.stars - a.stars };
    out.sort(sorts[q.sort] || sorts.rating);
    run('INSERT INTO analytics_events(type,ref) VALUES(?,?)', 'search', term || '*');
    res.json({ nights: dates.length, results: out });
  }));
  app.get('/api/hotels/:id', wrap((req, res) => {
    expireHolds();
    const h = get("SELECT * FROM hotels WHERE id=? AND status='approved'", req.params.id);
    if (!h) throw fail(404, 'Hotel not found');
    const q = req.query, stay = parseStay(q), v = viewerRole(req.user);
    const dates = q.checkIn && q.checkOut ? nightsList(q.checkIn, q.checkOut) : nightsList(today(), new Date(Date.now() + 864e5).toISOString().slice(0, 10));
    run('INSERT INTO analytics_events(type,ref) VALUES(?,?)', 'hotel_view', String(h.id));
    res.json({ ...publicHotel(h), nights: dates.length, offers: offersFor(h, dates, stay, v, rulesNow()) });
  }));

  // --- bookings
  function refGen() { return 'HB' + Date.now().toString(36).toUpperCase().slice(-5) + Math.random().toString(36).slice(2, 5).toUpperCase(); }
  app.post('/api/bookings', need('tourist', 'agency', 'admin'), wrap(async (req, res) => {
    expireHolds();
    const b = req.body || {};
    const idem = req.get('Idempotency-Key') || null;
    if (idem) {
      const ex = get('SELECT * FROM bookings WHERE user_id=? AND idem_key=?', req.user.id, idem);
      if (ex) return res.status(200).json(serializeBooking(ex, 'user'));
    }
    const rt = get('SELECT * FROM room_types WHERE id=?', Number(b.roomTypeId));
    const h = rt && get("SELECT * FROM hotels WHERE id=? AND status='approved'", rt.hotel_id);
    if (!h) throw fail(404, 'Room not found');
    const dates = nightsList(b.checkIn, b.checkOut);
    const rooms = Math.max(1, Math.min(9, parseInt(b.rooms) || 1)), adults = parseInt(b.adults) || 1, children = parseInt(b.children) || 0;
    if (rt.max_guests * rooms < adults + children) throw fail(400, 'Too many guests for this room');
    const g = b.guest || {};
    if (!g.name || !/^[^@\s]+@[^@\s]+$/.test(g.email || '')) throw fail(400, 'Guest name and valid email are required');
    const cur = P.CURRENCIES.includes(b.currency) ? b.currency : 'USD';
    const v = viewerRole(req.user);
    const payMethod = b.payMethod === 'contract' ? 'contract' : 'online';
    if (payMethod === 'contract' && v.role !== 'agency') throw fail(403, 'Contract payment is available for approved agencies only');

    const created = tx(() => {
      const offer = roomOffer(rt, dates, rooms);
      const quote = P.quoteStay({ hotel: h, roomId: rt.id, nights: offer.nights, rooms, role: v.role, agencyId: v.agencyId, rules: rulesNow() });
      if (payMethod === 'contract') {
        const ag = get('SELECT * FROM agencies WHERE id=?', v.agencyId);
        if (ag.debt + quote.total > ag.credit_limit) throw fail(402, 'Credit limit exceeded');
      }
      // atomic inventory hold: create row if missing, then conditional decrement
      for (const n of offer.nights) {
        run('INSERT OR IGNORE INTO inventory(room_type_id,date,available) VALUES(?,?,?)', rt.id, n.date, rt.count);
        const r = run('UPDATE inventory SET available=available-? WHERE room_type_id=? AND date=? AND closed=0 AND available>=?', rooms, rt.id, n.date, rooms);
        if (r.changes !== 1) throw fail(409, 'Not enough rooms available for the selected dates');
      }
      const snapshot = { ...quote.snapshot, currency: cur, rate: P.RATES[cur], rateSource: 'platform-fixed', priceModel: h.price_model };
      const status = payMethod === 'contract' ? 'pending' : 'on_hold';
      const id = Number(run(`INSERT INTO bookings(ref,user_id,hotel_id,room_type_id,check_in,check_out,rooms,adults,children,guest_name,guest_email,guest_phone,
        channel,pay_method,status,total_usd,currency,total_cur,snapshot,hold_expires,idem_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        refGen(), req.user.id, h.id, rt.id, b.checkIn, b.checkOut, rooms, adults, children, g.name, g.email, g.phone || '',
        v.role === 'agency' ? 'agency' : 'tourist', payMethod, status, quote.total, cur, P.convert(quote.total, cur), JSON.stringify(snapshot),
        status === 'on_hold' ? new Date(Date.now() + HOLD_MIN * 60000).toISOString() : null, idem).lastInsertRowid);
      const row = get('SELECT * FROM bookings WHERE id=?', id);
      run('INSERT INTO booking_history(booking_id,status,note) VALUES(?,?,?)', id, status, payMethod === 'contract' ? 'Settled on contract' : 'Inventory held');
      if (payMethod === 'contract') run('UPDATE agencies SET debt=debt+? WHERE id=?', quote.total, v.agencyId);
      audit(req.user.id, 'booking.create', { ref: row.ref });
      return row;
    });
    emit('booking.created', created);
    if (created.pay_method === 'contract') await finalizeBooking(created, 'Settled on contract');
    res.status(201).json(serializeBooking(get('SELECT * FROM bookings WHERE id=?', created.id), 'user'));
  }));
  function bookingSummary(b) {
    const h = get('SELECT name FROM hotels WHERE id=?', b.hotel_id);
    const nights = nightsList2(b.check_in, b.check_out).length;
    return { ref: b.ref, hotel: h?.name, checkIn: b.check_in, checkOut: b.check_out, nights, total: b.total_cur, currency: b.currency, channel: b.channel, status: b.status, contact: { name: b.guest_name, email: b.guest_email, phone: b.guest_phone } };
  }
  const emit = (event, b) => { try { outbox.emit(event, bookingSummary(get('SELECT * FROM bookings WHERE id=?', b.id))); } catch (e) { console.error('outbox', e.message); } };
  /** Confirm a booking; supplier hotels must be confirmed by the supplier before we show "confirmed". */
  async function finalizeBooking(b, how) {
    const h = get('SELECT * FROM hotels WHERE id=?', b.hotel_id);
    if (!h.supplier_id) { tx(() => setStatus(b, 'confirmed', how)); return notifyConfirmed(b); }
    tx(() => setStatus(b, 'pending', 'Awaiting supplier confirmation'));
    try {
      const room = get('SELECT * FROM room_types WHERE id=?', b.room_type_id);
      const r = await suppliers.book(h, room, b, { name: b.guest_name, email: b.guest_email, phone: b.guest_phone });
      tx(() => { run('UPDATE bookings SET external_ref=? WHERE id=?', r.externalRef, b.id); setStatus(b, 'confirmed', how + ' + supplier ' + r.externalRef); });
      notifyConfirmed(b);
    } catch (e) {
      tx(() => {
        releaseInventory(b);
        if (b.pay_method === 'contract') { const u = get('SELECT agency_id FROM users WHERE id=?', b.user_id); run('UPDATE agencies SET debt=MAX(0,debt-?) WHERE id=?', b.total_usd, u.agency_id); }
        setStatus(b, 'failed', 'Supplier error: ' + e.message);
        if (b.pay_method === 'online' && get("SELECT 1 FROM payments WHERE booking_id=? AND status='paid'", b.id)) { run('INSERT INTO refunds(booking_id,amount_usd) VALUES(?,?)', b.id, b.total_usd); setStatus(b, 'refunded', 'Auto refund: supplier rejected'); }
      });
      emit('booking.cancelled', b);
      throw fail(502, 'The supplier could not confirm this booking. You have not been charged.');
    }
  }
  function notifyConfirmed(b) {
    emit('booking.confirmed', b);
    notify(b.user_id, `Booking ${b.ref} confirmed`);
    for (const u of all('SELECT id FROM users WHERE hotel_id=?', b.hotel_id)) notify(u.id, `New booking ${b.ref}`);
  }
  function ownBooking(req) {
    const b = get('SELECT * FROM bookings WHERE id=?', Number(req.params.id));
    if (!b || (b.user_id !== req.user.id && req.user.role !== 'admin')) throw fail(404, 'Booking not found');
    return b;
  }
  app.get('/api/bookings', need(), (req, res) => {
    const rows = req.user.role === 'admin' ? [] : all('SELECT * FROM bookings WHERE user_id=? ORDER BY id DESC', req.user.id);
    res.json(rows.map((b) => serializeBooking(b, 'user')));
  });
  app.get('/api/bookings/:id', need(), wrap((req, res) => res.json(serializeBooking(ownBooking(req), 'user'))));
  app.post('/api/bookings/:id/pay', need(), wrap(async (req, res) => {
    expireHolds();
    const b = ownBooking(req);
    if (b.status !== 'on_hold') throw fail(409, 'Booking is not awaiting payment');
    if (Pay.provider() === 'stripe') {
      const base = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
      const s = await Pay.createStripeCheckout({ booking: b, successUrl: `${base}/#/booking/${b.id}`, cancelUrl: `${base}/#/pay/${b.id}` });
      run('UPDATE bookings SET provider_ref=? WHERE id=?', s.id, b.id);
      return res.json({ redirectUrl: s.url });
    }
    const num = String(req.body?.card?.number || '').replace(/\s/g, '');
    if (!/^\d{12,19}$/.test(num)) throw fail(400, 'Invalid card number');
    // Demo gateway: card data is never stored, only the last 4 digits. Cards ending 0000 are declined.
    const declined = num.endsWith('0000');
    run('INSERT INTO payments(booking_id,amount_usd,status,last4) VALUES(?,?,?,?)', b.id, b.total_usd, declined ? 'failed' : 'paid', num.slice(-4));
    if (declined) { audit(req.user.id, 'payment.failed', { ref: b.ref }); emit('payment.failed', b); throw fail(402, 'Payment declined'); }
    await finalizeBooking(b, 'Paid online');
    res.json(serializeBooking(get('SELECT * FROM bookings WHERE id=?', b.id), 'user'));
  }));
  function cancelBooking(b, uid, note) {
    if (!(TRANSITIONS[b.status] || []).includes('cancelled')) throw fail(409, `Cannot cancel a ${b.status} booking`);
    return tx(() => {
      const wasConfirmed = b.status === 'confirmed';
      releaseInventory(b);
      setStatus(b, 'cancelled', note, uid);
      const free = Date.parse(b.check_in + 'T00:00:00Z') - Date.now() >= 48 * 3600e3;
      if (wasConfirmed && b.pay_method === 'online') {
        const snap = J(b.snapshot, {});
        const first = snap.nights?.[0] ? snap.nights[0].price * b.rooms : 0;
        const refund = free ? b.total_usd : P.round2(Math.max(0, b.total_usd - first));
        run('INSERT INTO refunds(booking_id,amount_usd) VALUES(?,?)', b.id, refund);
        setStatus(b, refund >= b.total_usd ? 'refunded' : 'partially_refunded', `Refund ${refund} USD`, uid);
      }
      if (wasConfirmed && b.pay_method === 'contract') {
        const ag = get('SELECT agency_id FROM users WHERE id=?', b.user_id);
        run('UPDATE agencies SET debt=MAX(0,debt-?) WHERE id=?', b.total_usd, ag.agency_id);
      }
      notify(b.user_id, `Booking ${b.ref} cancelled`);
      return get('SELECT * FROM bookings WHERE id=?', b.id);
    });
  }
  async function cancelFull(b, uid, note) {
    if (b.external_ref && b.status === 'confirmed') {
      try { await suppliers.cancel(b.hotel_id, b.external_ref); } catch (e) { throw fail(502, 'Supplier cancellation failed: ' + e.message); }
    }
    const out = cancelBooking(b, uid, note);
    emit('booking.cancelled', out);
    return out;
  }
  app.post('/api/bookings/:id/cancel', need(), wrap(async (req, res) => {
    expireHolds();
    res.json(serializeBooking(await cancelFull(ownBooking(req), req.user.id, 'Cancelled by user'), 'user'));
  }));

  // --- hotel cabinet
  const myHotel = (req) => { if (!req.user.hotel_id) throw fail(403, 'No hotel linked to your account yet'); return get('SELECT * FROM hotels WHERE id=?', req.user.hotel_id); };
  app.get('/api/hotel/me', need('hotel'), wrap((req, res) => {
    const h = myHotel(req);
    const claim = get('SELECT * FROM hotel_claims WHERE user_id=? ORDER BY id DESC', req.user.id);
    res.json({
      hotel: { ...publicHotel(h), status: h.status, priceModel: h.price_model, source: h.source }, claim,
      rooms: all('SELECT * FROM room_types WHERE hotel_id=?', h.id).map((r) => ({ id: r.id, name: r.name, maxGuests: r.max_guests, basePrice: r.base_price, count: r.count })),
      bookings: all('SELECT * FROM bookings WHERE hotel_id=? ORDER BY id DESC LIMIT 100', h.id).map((b) => serializeBooking(b, 'hotel')),
    });
  }));
  app.get('/api/hotel/status', need('hotel'), (req, res) => res.json({ linked: !!req.user.hotel_id, claim: get('SELECT * FROM hotel_claims WHERE user_id=? ORDER BY id DESC', req.user.id) || null }));
  app.patch('/api/hotel/me', need('hotel'), wrap((req, res) => {
    const h = myHotel(req), b = req.body || {};
    run('UPDATE hotels SET description=COALESCE(?,description), website=COALESCE(?,website), instagram=COALESCE(?,instagram), cancel_policy=COALESCE(?,cancel_policy) WHERE id=?',
      b.description ?? null, b.website ?? null, b.instagram ?? null, b.cancelPolicy ?? null, h.id);
    audit(req.user.id, 'hotel.update', { id: h.id });
    res.json({ ok: true });
  }));
  app.put('/api/hotel/rooms/:id/inventory', need('hotel'), wrap((req, res) => {
    const h = myHotel(req);
    const rt = get('SELECT * FROM room_types WHERE id=? AND hotel_id=?', Number(req.params.id), h.id);
    if (!rt) throw fail(404, 'Room not found');
    const { from, to, available, price, closed } = req.body || {};
    const rx = /^\d{4}-\d{2}-\d{2}$/;
    if (!rx.test(from || '') || (to && (!rx.test(to) || to < from))) throw fail(400, 'Invalid range');
    const list = to ? [...nightsList2(from, to), to] : [from];
    if (list.length > 366) throw fail(400, 'Range too long');
    if (available != null && (!Number.isInteger(available) || available < 0)) throw fail(400, 'Invalid availability');
    if (price != null && !(price > 0)) throw fail(400, 'Invalid price');
    tx(() => {
      for (const d of list) {
        run('INSERT OR IGNORE INTO inventory(room_type_id,date,available) VALUES(?,?,?)', rt.id, d, rt.count);
        run('UPDATE inventory SET available=COALESCE(?,available), price=COALESCE(?,price), closed=COALESCE(?,closed) WHERE room_type_id=? AND date=?',
          available ?? null, price ?? null, closed == null ? null : closed ? 1 : 0, rt.id, d);
      }
    });
    audit(req.user.id, 'inventory.update', { room: rt.id, from, to });
    res.json({ ok: true, days: list.length });
  }));
  app.patch('/api/hotel/bookings/:id', need('hotel'), wrap((req, res) => {
    const h = myHotel(req);
    const b = get('SELECT * FROM bookings WHERE id=? AND hotel_id=?', Number(req.params.id), h.id);
    if (!b) throw fail(404, 'Booking not found');
    if (typeof req.body?.roomNumber === 'string') run('UPDATE bookings SET room_number=? WHERE id=?', req.body.roomNumber.slice(0, 10), b.id);
    res.json(serializeBooking(get('SELECT * FROM bookings WHERE id=?', b.id), 'hotel'));
  }));

  // --- admin
  const adminBase = need('admin');
  const admin = (req, res, next) => adminBase(req, res, (e) => {
    if (e) return next(e);
    if (process.env.REQUIRE_ADMIN_MFA === '1' && !req.user.mfa_enabled) return next(Object.assign(fail(403, 'Enable two-factor authentication to use the admin panel'), { mfaSetupRequired: true }));
    next();
  });
  app.get('/api/admin/stats', admin, (req, res) => {
    const s = (sql) => get(sql) || {};
    const ok = "status IN ('confirmed','partially_refunded')";
    const t = s(`SELECT COUNT(*) n, COALESCE(SUM(total_usd),0) gross FROM bookings WHERE ${ok}`);
    let payable = 0;
    for (const b of all(`SELECT snapshot FROM bookings WHERE ${ok}`)) payable += J(b.snapshot, {}).hotelPayable || 0;
    res.json({
      bookings: t.n, grossUsd: P.round2(t.gross), hotelPayableUsd: P.round2(payable), revenueUsd: P.round2(t.gross - payable),
      byStatus: all('SELECT status, COUNT(*) n FROM bookings GROUP BY status'),
      byChannel: all(`SELECT channel, COUNT(*) n, SUM(total_usd) usd FROM bookings WHERE ${ok} GROUP BY channel`),
      hotels: s('SELECT COUNT(*) n FROM hotels').n, agenciesPending: s("SELECT COUNT(*) n FROM agencies WHERE status='pending'").n,
      claimsNew: s("SELECT COUNT(*) n FROM hotel_claims WHERE status='new'").n,
      funnel: { searches: s("SELECT COUNT(*) n FROM analytics_events WHERE type='search'").n, hotelViews: s("SELECT COUNT(*) n FROM analytics_events WHERE type='hotel_view'").n, checkoutStarts: s("SELECT COUNT(*) n FROM analytics_events WHERE type='checkout'").n, bookings: s('SELECT COUNT(*) n FROM bookings').n },
    });
  });
  app.get('/api/admin/hotels', admin, (req, res) => res.json(all('SELECT id,name,city,country,stars,price_model priceModel,source,status FROM hotels ORDER BY id DESC')));
  app.post('/api/admin/hotels', admin, wrap((req, res) => {
    const b = req.body || {};
    if (!b.name || !b.city || !b.country) throw fail(400, 'name, city and country are required');
    const id = Number(run('INSERT INTO hotels(name,country,city,address,stars,description,price_model,images,amenities) VALUES(?,?,?,?,?,?,?,?,?)',
      b.name, b.country, b.city, b.address || '', Math.min(5, Math.max(1, +b.stars || 3)), b.description || '', b.priceModel === 'brutto' ? 'brutto' : 'netto',
      JSON.stringify(b.images?.length ? b.images : []), JSON.stringify(b.amenities || ['wifi'])).lastInsertRowid);
    run('INSERT INTO room_types(hotel_id,name,max_guests,bed,base_price,count) VALUES(?,?,?,?,?,?)', id, 'Standard Room', 2, '1 double bed', +b.basePrice > 0 ? +b.basePrice : 50, 5);
    audit(req.user.id, 'hotel.create', { id });
    res.status(201).json({ id });
  }));
  app.patch('/api/admin/hotels/:id', admin, wrap((req, res) => {
    const { status, priceModel } = req.body || {};
    if (status && !['approved', 'hidden', 'pending'].includes(status)) throw fail(400, 'Invalid status');
    if (priceModel && !['netto', 'brutto'].includes(priceModel)) throw fail(400, 'Invalid model');
    run('UPDATE hotels SET status=COALESCE(?,status), price_model=COALESCE(?,price_model) WHERE id=?', status ?? null, priceModel ?? null, Number(req.params.id));
    audit(req.user.id, 'hotel.patch', { id: req.params.id, status, priceModel });
    res.json({ ok: true });
  }));
  app.get('/api/admin/claims', admin, (req, res) => res.json(all(`SELECT c.*, u.email, u.name user_name, h.name hotel_name FROM hotel_claims c
    JOIN users u ON u.id=c.user_id LEFT JOIN hotels h ON h.id=c.hotel_id ORDER BY c.id DESC`)));
  app.patch('/api/admin/claims/:id', admin, wrap((req, res) => {
    const c = get('SELECT * FROM hotel_claims WHERE id=?', Number(req.params.id));
    const status = req.body?.status;
    if (!c) throw fail(404, 'Not found');
    if (!['new', 'reviewing', 'need_info', 'approved', 'rejected'].includes(status)) throw fail(400, 'Invalid status');
    tx(() => {
      if (status === 'approved') {
        let hid = c.hotel_id;
        if (!hid) hid = Number(run("INSERT INTO hotels(name,country,city,status,source) VALUES(?,?,?,'approved','direct')", c.new_name, c.country || '', c.city || '').lastInsertRowid);
        if (!get('SELECT 1 FROM room_types WHERE hotel_id=?', hid)) run("INSERT INTO room_types(hotel_id,name,base_price) VALUES(?,'Standard Room',50)", hid);
        run('UPDATE users SET hotel_id=? WHERE id=?', hid, c.user_id);
        notify(c.user_id, 'Your hotel management request was approved');
      }
      run('UPDATE hotel_claims SET status=? WHERE id=?', status, c.id);
      audit(req.user.id, 'claim.' + status, { id: c.id });
    });
    res.json({ ok: true });
  }));
  app.get('/api/admin/agencies', admin, (req, res) => res.json(all('SELECT id,name,voen,country,contact,status,credit_limit creditLimit,debt FROM agencies ORDER BY id DESC')));
  app.patch('/api/admin/agencies/:id', admin, wrap((req, res) => {
    const { status, creditLimit } = req.body || {};
    if (status && !['pending', 'approved', 'rejected', 'need_info'].includes(status)) throw fail(400, 'Invalid status');
    if (creditLimit != null && !(creditLimit >= 0)) throw fail(400, 'Invalid credit limit');
    run('UPDATE agencies SET status=COALESCE(?,status), credit_limit=COALESCE(?,credit_limit) WHERE id=?', status ?? null, creditLimit ?? null, Number(req.params.id));
    if (status) for (const u of all('SELECT id FROM users WHERE agency_id=?', Number(req.params.id))) notify(u.id, `Agency status: ${status}`);
    audit(req.user.id, 'agency.patch', { id: req.params.id, status, creditLimit });
    res.json({ ok: true });
  }));
  app.get('/api/admin/users', admin, (req, res) => res.json(all('SELECT id,email,name,role,agency_id agencyId,hotel_id hotelId,created_at createdAt FROM users ORDER BY id DESC')));
  app.get('/api/admin/rules', admin, (req, res) => res.json(all('SELECT * FROM pricing_rules ORDER BY id DESC')));
  app.post('/api/admin/rules', admin, wrap((req, res) => {
    const b = req.body || {};
    if (!['markup', 'agency_discount', 'commission'].includes(b.kind)) throw fail(400, 'Invalid kind');
    if (!['platform', 'country', 'hotel', 'room', 'agency'].includes(b.scope)) throw fail(400, 'Invalid scope');
    if (!(b.percent >= 0 && b.percent < 100)) throw fail(400, 'Percent must be between 0 and 100');
    if (b.scope !== 'platform' && !b.scopeRef) throw fail(400, 'scopeRef is required');
    const nr = { kind: b.kind, scope: b.scope, scope_ref: b.scope === 'platform' ? null : String(b.scopeRef), percent: +b.percent, date_from: b.dateFrom || null, date_to: b.dateTo || null };
    const clash = P.findConflict(all('SELECT * FROM pricing_rules WHERE active=1'), nr);
    if (clash) throw fail(409, `Conflicts with active rule #${clash.id} (same scope and overlapping dates). Deactivate it first.`);
    const id = Number(run('INSERT INTO pricing_rules(kind,scope,scope_ref,percent,date_from,date_to) VALUES(?,?,?,?,?,?)', nr.kind, nr.scope, nr.scope_ref, nr.percent, nr.date_from, nr.date_to).lastInsertRowid);
    audit(req.user.id, 'rule.create', { id, ...nr });
    res.status(201).json({ id });
  }));
  app.delete('/api/admin/rules/:id', admin, (req, res) => {
    run('UPDATE pricing_rules SET active=0 WHERE id=?', Number(req.params.id));
    audit(req.user.id, 'rule.deactivate', { id: req.params.id });
    res.json({ ok: true });
  });
  app.get('/api/admin/bookings', admin, (req, res) => res.json(all('SELECT * FROM bookings ORDER BY id DESC LIMIT 200').map((b) => serializeBooking(b, 'admin'))));
  app.post('/api/admin/bookings/:id/status', admin, wrap(async (req, res) => {
    expireHolds();
    const b = get('SELECT * FROM bookings WHERE id=?', Number(req.params.id));
    const to = req.body?.status;
    if (!b) throw fail(404, 'Not found');
    if (to === 'cancelled') return res.json(serializeBooking(await cancelFull(b, req.user.id, 'Cancelled by admin'), 'admin'));
    if (!(TRANSITIONS[b.status] || []).includes(to)) throw fail(409, `Transition ${b.status} → ${to} is not allowed`);
    tx(() => setStatus(b, to, 'Changed by admin', req.user.id));
    res.json(serializeBooking(get('SELECT * FROM bookings WHERE id=?', b.id), 'admin'));
  }));
  app.get('/api/admin/audit', admin, (req, res) => res.json(all('SELECT a.*, u.email FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 200')));

  // --- integrations, suppliers, rates, content
  app.get('/api/admin/integrations', admin, (req, res) => res.json({
    payment: Pay.provider(), outbox: outbox.status(), suppliers: all('SELECT id,code,name,adapter,active,last_sync lastSync,last_status lastStatus,last_error lastError FROM suppliers'),
    rates: P.RATES, ratesHistory: all('SELECT currency,per_usd perUsd,source,at FROM currency_rates ORDER BY id DESC LIMIT 20'),
  }));
  app.post('/api/admin/outbox/:id/retry', admin, (req, res) => { outbox.retry(Number(req.params.id)); res.json({ ok: true }); });
  app.post('/api/admin/outbox/process', admin, wrap(async (req, res) => res.json({ processed: await outbox.process() })));
  app.post('/api/admin/suppliers/:id/sync', admin, wrap(async (req, res) => {
    const sup = get('SELECT * FROM suppliers WHERE id=?', Number(req.params.id));
    if (!sup) throw fail(404, 'Not found');
    const r = await suppliers.sync(sup);
    audit(req.user.id, 'supplier.sync', { id: sup.id, ...r });
    res.json(r);
  }));
  app.put('/api/admin/rates', admin, wrap((req, res) => {
    const r = req.body || {};
    tx(() => {
      for (const c of ['EUR', 'RUB', 'AZN', 'UZS']) if (r[c] != null) {
        if (!(r[c] > 0)) throw fail(400, 'Invalid rate for ' + c);
        run('INSERT INTO currency_rates(currency,per_usd,source) VALUES(?,?,?)', c, +r[c], 'admin:' + req.user.email);
      }
    });
    P.setRates(Object.fromEntries(['EUR', 'RUB', 'AZN', 'UZS'].filter((c) => r[c] != null).map((c) => [c, +r[c]])));
    audit(req.user.id, 'rates.update', r);
    res.json({ rates: P.RATES });
  }));
  app.get('/api/pages/:slug', (req, res) => {
    const p = get('SELECT title,body FROM cms_pages WHERE slug=? AND lang=?', req.params.slug, req.query.lang || 'en') || get("SELECT title,body FROM cms_pages WHERE slug=? AND lang='en'", req.params.slug);
    if (!p) return res.status(404).json({ error: 'Not found' });
    res.json(p);
  });
  app.get('/api/admin/pages', admin, (req, res) => res.json(all('SELECT slug,lang,title,body FROM cms_pages ORDER BY slug,lang')));
  app.put('/api/admin/pages/:slug/:lang', admin, wrap((req, res) => {
    const { slug, lang } = req.params;
    if (!/^[a-z0-9-]{1,40}$/.test(slug) || !['en', 'az', 'ru', 'uz'].includes(lang)) throw fail(400, 'Invalid slug/lang');
    run('INSERT INTO cms_pages(slug,lang,title,body) VALUES(?,?,?,?) ON CONFLICT(slug,lang) DO UPDATE SET title=excluded.title, body=excluded.body', slug, lang, String(req.body?.title || '').slice(0, 200), String(req.body?.body || '').slice(0, 20000));
    audit(req.user.id, 'cms.update', { slug, lang });
    res.json({ ok: true });
  }));

  // --- SEO: crawlable hotel pages, sitemap, robots
  const baseUrl = (req) => process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  const xe = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  app.get('/h/:id', (req, res) => {
    const h = get("SELECT * FROM hotels WHERE id=? AND status='approved'", Number(req.params.id));
    if (!h) return res.status(404).send('Not found');
    const img = J(h.images)[0] || '';
    const ld = { '@context': 'https://schema.org', '@type': 'Hotel', name: h.name, description: h.description, image: img, starRating: { '@type': 'Rating', ratingValue: h.stars },
      address: { '@type': 'PostalAddress', streetAddress: h.address, addressLocality: h.city, addressCountry: h.country } };
    const url = `${baseUrl(req)}/h/${h.id}`;
    res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${xe(h.name)} - ${xe(h.city)} | Stayly</title>
<meta name="description" content="${xe(h.description)}"><link rel="canonical" href="${url}"><meta property="og:title" content="${xe(h.name)}"><meta property="og:description" content="${xe(h.description)}"><meta property="og:image" content="${xe(img)}"><meta property="og:url" content="${url}">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script></head><body><h1>${xe(h.name)}</h1><p>${xe(h.city)}, ${xe(h.country)} - ${h.stars} stars</p><p>${xe(h.description)}</p><p><a href="/#/hotel/${h.id}">Book now</a></p>
<script>location.replace('/#/hotel/${h.id}')</script></body></html>`);
  });
  app.get('/sitemap.xml', (req, res) => {
    const u = baseUrl(req);
    res.type('xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${u}/</loc></url>${all("SELECT id FROM hotels WHERE status='approved'").map((h) => `<url><loc>${u}/h/${h.id}</loc></url>`).join('')}</urlset>`);
  });
  app.get('/robots.txt', (req, res) => res.type('text').send(`User-agent: *\nDisallow: /api/\nSitemap: ${baseUrl(req)}/sitemap.xml\n`));

  // --- static + errors
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use((err, req, res, next) => { // eslint-disable-line
    if (err.type === 'entity.parse.failed') err = fail(400, 'Invalid JSON');
    if (!err.status) console.error(err);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Internal error' });
  });

  const timers = [
    setInterval(() => { try { expireHolds(); } catch (e) { console.error(e); } }, 60000),
    setInterval(() => outbox.process().catch((e) => console.error('outbox', e.message)), 15000),
    setInterval(() => suppliers.syncAll().catch((e) => console.error('sync', e.message)), (+process.env.SUPPLIER_SYNC_MIN || 30) * 60000),
  ];
  timers.forEach((t) => t.unref());
  if (!get('SELECT 1 FROM cms_pages LIMIT 1')) {
    for (const [slug, title, body] of [['about', 'About Stayly', 'Stayly connects travellers and travel agencies with hotels in Azerbaijan and Uzbekistan.'], ['terms', 'Terms of use', 'Edit this page in Admin > Content.'], ['privacy', 'Privacy policy', 'Edit this page in Admin > Content.']]) run('INSERT INTO cms_pages(slug,lang,title,body) VALUES(?,?,?,?)', slug, 'en', title, body);
  }
  suppliers.syncAll().catch((e) => console.error('sync', e.message));
  return { app, db, outbox, suppliers, close: () => { timers.forEach(clearInterval); db.close(); } };
}

module.exports = { createApp };

/* Stayly SPA — vanilla JS, hash routing */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = { user: null, token: localStorage.getItem('tok'), lang: localStorage.getItem('lang') || ['ru', 'en', 'uz', 'az'].find((l) => (navigator.language || '').toLowerCase().startsWith(l)) || 'ru', cur: localStorage.getItem('cur') || 'USD', meta: null };
const t = (k, v) => { let s = (I18N[S.lang] && I18N[S.lang][k]) || I18N.en[k] || k; if (v) for (const x in v) s = s.replace('{' + x + '}', v[x]); return s; };
const SYM = { USD: '$', EUR: '€', RUB: '₽', AZN: '₼', UZS: 'soʻm' };
const rateOf = (c) => (S.meta && S.meta.rates[c]) || 1;
const money = (n, c = S.cur) => (c === 'UZS' ? Math.round(n).toLocaleString('ru-RU') + ' ' + SYM[c] : SYM[c] + ' ' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const FALLBACK = 'linear-gradient(135deg,#0b2a5b,#0a6cff)';
const bg = (u) => `style="background-image:url('${esc(u || '')}'),${FALLBACK}"`;
const iso = (d) => d.toISOString().slice(0, 10);
const plus = (n) => iso(new Date(Date.now() + n * 864e5));
const stars = (n) => '<span class="stars" aria-label="' + n + ' stars">' + '★'.repeat(n) + '</span>';
const AMEN = { wifi: '📶', pool: '🏊', spa: '💆', parking: '🅿️', restaurant: '🍽️', gym: '🏋️', ac: '❄️' };

async function api(path, opt = {}) {
  const r = await fetch('/api' + path, { method: opt.method || 'GET', headers: { 'Content-Type': 'application/json', ...(S.token ? { Authorization: 'Bearer ' + S.token } : {}), ...(opt.headers || {}) }, body: opt.body ? JSON.stringify(opt.body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { if (r.status === 401 && S.token && !opt.quiet) logout(true); throw Object.assign(new Error(d.error || t('error')), { status: r.status }); }
  return d;
}
function toast(m) { const e = $('#toast'); e.textContent = m; e.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('on'), 2600); }
const track = (type, ref) => fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, ref }) }).catch(() => {});

const go = (h) => { if (location.hash === h || (h === '#/' && !location.hash)) route(); else location.hash = h; };
function logout(silent) { S.token = null; S.user = null; localStorage.removeItem('tok'); renderTop(); if (!silent) toast('👋'); go('#/'); }
async function loadUser() { if (!S.token) return; try { S.user = await api('/me', { quiet: true }); } catch { S.token = null; localStorage.removeItem('tok'); } }

/* ---------- layout ---------- */
function renderTop() {
  const u = S.user;
  const cab = u ? { admin: ['#/admin', t('admin')], hotel: ['#/cabinet', t('cabinet')], agency: ['#/agency', t('agencyDesk')], tourist: ['#/trips', t('trips')] }[u.role] : null;
  $('#top').innerHTML = `<div class="wrap"><a class="logo" href="#/"><i>S</i>Stayly</a>
  <nav class="nav"><a href="#/search">${t('explore')}</a><a href="#/search?sort=price">${t('deals')}</a><a href="#/destinations">${t('destinations')}</a>${u ? `<a href="#/trips">${t('trips')}</a>` : ''}${cab && u.role !== 'tourist' ? `<a href="${cab[0]}">${cab[1]}</a>` : ''}</nav>
  <select id="cur" aria-label="${t('currency')}">${['USD', 'EUR', 'RUB', 'AZN', 'UZS'].map((c) => `<option ${c === S.cur ? 'selected' : ''}>${c}</option>`).join('')}</select>
  <select id="lang" aria-label="${t('language')}">${[['ru', 'RU'], ['en', 'EN'], ['uz', 'UZ'], ['az', 'AZ']].map(([k, l]) => `<option value="${k}" ${k === S.lang ? 'selected' : ''}>${l}</option>`).join('')}</select>
  ${u ? `<a class="pill hide-sm" href="#/security" title="${t('security')}">🔒 ${esc(u.name || u.email)}</a><button class="pill" id="out">${t('logout')}</button>` : `<a class="btn gold sm" style="border-radius:99px;padding:8px 20px" href="#/login">${t('login')}</a>`}</div>`;
  $('#cur').onchange = (e) => { S.cur = e.target.value; localStorage.setItem('cur', S.cur); route(); };
  $('#lang').onchange = (e) => { S.lang = e.target.value; localStorage.setItem('lang', S.lang); document.documentElement.lang = S.lang; renderTop(); route(); };
  if ($('#out')) $('#out').onclick = () => logout();
  $('#foot').innerHTML = `<div class="foot-links">${['about', 'contact', 'terms', 'privacy'].map((p) => `<a href="#/${p === 'contact' ? 'contact' : 'page/' + p}">${t('p_' + p)}</a>`).join('')}</div>${contactButtons(true)}<div style="margin-top:10px">${esc(t('footer'))}</div>`;
}

/* ---------- contact buttons ---------- */
const CONTACT_DEF = { phone: '+994 12 000 00 00', telegram: 'https://t.me/', whatsapp: 'https://wa.me/', facebook: 'https://www.facebook.com/', instagram: 'https://www.instagram.com/' };
function contactButtons(small) {
  const c = { ...CONTACT_DEF, ...((S.meta && S.meta.contact) || {}) };
  const tel = 'tel:' + String(c.phone).replace(/[^+\d]/g, '');
  const items = [
    ['phone', tel, '📞', c.phone, '#0b7a4b'], ['telegram', c.telegram, '✈️', 'Telegram', '#229ed9'], ['whatsapp', c.whatsapp, '💬', 'WhatsApp', '#25d366'],
    ['facebook', c.facebook, 'f', 'Facebook', '#1877f2'], ['instagram', c.instagram, '◎', 'Instagram', '#d6249f'],
  ];
  return `<div class="cbtns ${small ? 'small' : ''}">${items.map(([k, href, ic, label, col]) => `<a class="cbtn" style="--c:${col}" href="${esc(href)}" ${k === 'phone' ? '' : 'target="_blank" rel="noopener noreferrer"'} aria-label="${k}"><b>${ic}</b>${small ? '' : `<span>${esc(label)}</span>`}</a>`).join('')}</div>`;
}

/* minimal, safe markdown for CMS pages: ## headings, - lists, **bold**, *italic*, 1. lists */
function md(src) {
  const inline = (x) => esc(x).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>');
  let out = '', list = null;
  const close = () => { if (list) { out += `</${list}>`; list = null; } };
  for (const line of String(src).split('\n')) {
    let m;
    if ((m = line.match(/^## (.*)/))) { close(); out += `<h2>${inline(m[1])}</h2>`; }
    else if ((m = line.match(/^- (.*)/))) { if (list !== 'ul') { close(); out += '<ul>'; list = 'ul'; } out += `<li>${inline(m[1])}</li>`; }
    else if ((m = line.match(/^\d+\. (.*)/))) { if (list !== 'ol') { close(); out += '<ol>'; list = 'ol'; } out += `<li>${inline(m[1])}</li>`; }
    else if (!line.trim()) close();
    else { close(); out += `<p>${inline(line)}</p>`; }
  }
  close();
  return out;
}

/* ---------- router ---------- */
const routes = [];
const R = (re, fn) => routes.push([re, fn]);
async function route() {
  const hash = location.hash.slice(1) || '/';
  const [path, qs] = hash.split('?');
  const q = Object.fromEntries(new URLSearchParams(qs || ''));
  const app = $('#app');
  $('#top').classList.toggle('over', path === '/' || path === '/search' || /^\/hotel\/\d+$/.test(path));
  $('#top').classList.toggle('home', path === '/');
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (m) {
      app.innerHTML = `<div class="spin">${t('loading')}</div>`;
      try { await fn(app, m, q); } catch (e) { app.innerHTML = `<div class="wrap sec"><div class="err">${esc(e.message)}</div></div>`; }
      window.scrollTo(0, 0);
      return;
    }
  }
  location.hash = '#/';
}
window.addEventListener('hashchange', route);

/* ---------- search box ---------- */
function searchBox(q = {}, compact = false) {
  return `<form class="sbox ${compact === 'hero' ? 'hero' : compact ? 'compact' : ''}" id="sf">
   <div><label>${t('where')}</label><input name="q" list="cities" value="${esc(q.q || '')}" placeholder="Baku, Tashkent…" autocomplete="off"><datalist id="cities">${(S.meta?.cities || []).map((c) => `<option value="${esc(c.city)}">`).join('')}</datalist></div>
   <div><label>${t('checkIn')}</label><input type="date" name="checkIn" min="${plus(0)}" value="${esc(q.checkIn || plus(14))}" required></div>
   <div><label>${t('checkOut')}</label><input type="date" name="checkOut" min="${plus(1)}" value="${esc(q.checkOut || plus(16))}" required></div>
   <div><label>${t('adults')} · ${t('children')} · ${t('rooms')}</label><div style="display:flex;gap:4px"><input type="number" name="adults" min="1" max="20" value="${esc(q.adults || 2)}" aria-label="${t('adults')}"><input type="number" name="children" min="0" max="10" value="${esc(q.children || 0)}" aria-label="${t('children')}"><input type="number" name="rooms" min="1" max="9" value="${esc(q.rooms || 1)}" aria-label="${t('rooms')}"></div></div>
   <button class="btn" type="submit">${t('search')}</button></form>`;
}
function bindSearch(extra = {}) {
  const f = $('#sf');
  const ci = f.checkIn, co = f.checkOut;
  ci.onchange = () => { if (co.value <= ci.value) { const d = new Date(ci.value); d.setDate(d.getDate() + 1); co.value = iso(d); } co.min = ci.value; };
  f.onsubmit = (e) => {
    e.preventDefault();
    const p = new URLSearchParams({ ...Object.fromEntries(new FormData(f)), ...extra });
    for (const [k, v] of [...p]) if (v === '') p.delete(k);
    location.hash = '#/search?' + p;
  };
}
const stayQs = (q) => new URLSearchParams(Object.fromEntries(['checkIn', 'checkOut', 'adults', 'children', 'rooms'].filter((k) => q[k]).map((k) => [k, q[k]]))).toString();

/* ---------- home ---------- */
R(/^\/$/, async (app) => {
  const d = await api(`/hotels?checkIn=${plus(14)}&checkOut=${plus(16)}&currency=${S.cur}&sort=rating`);
  const dest = { Baku: 'photo-1597043709571-5d3f4d7a4a8c', Tashkent: 'photo-1565008576549-57569a49371d', Samarkand: 'photo-1596484552834-6a58f850e0a1', Bukhara: 'photo-1590079070277-f5a0b3b3cf0c', Gabala: 'photo-1506905925346-21bda4d32df4', Sheki: 'photo-1469474968028-56623f02e42e', Khiva: 'photo-1528127269322-539801943592' };
  app.innerHTML = `<section class="hero2" style="background-image:url('https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=2000&q=70'),linear-gradient(160deg,#0b3550,#07202f 70%)"><div class="ghost-word" aria-hidden="true">Stayly</div><div class="wrap in"><h1>${t('heroTitle')}</h1>${searchBox({}, 'hero')}</div></section>
  <div class="wrap">${S.user ? '' : `<div class="grid g2">
   <div class="card entry"><div class="ico">🧳</div><div><h3>${t('forTourist')}</h3><p>${t('forTouristSub')}</p><a class="btn" href="#/register?type=tourist">${t('createAccount')}</a></div></div>
   <div class="card entry"><div class="ico">🏢</div><div><h3>${t('forAgency')}</h3><p>${t('forAgencySub')}</p><a class="btn gold" href="#/register?type=agency">${t('registerAgency')}</a></div></div></div>`}
  <div class="sec"><h2>${t('featured')}</h2><div class="grid g3">${d.results.slice(0, 6).map((h) => `<a class="card" href="#/hotel/${h.id}?${stayQs({ checkIn: plus(14), checkOut: plus(16) })}" style="color:inherit;text-decoration:none"><div style="height:170px;background-size:cover;background-position:center;background-image:url('${esc(h.image)}'),${FALLBACK}"></div><div class="pad"><div>${stars(h.stars)}</div><h3>${esc(h.name)}</h3><div class="muted small">${esc(h.city)}, ${esc(h.country)}</div><div style="margin-top:10px;display:flex;justify-content:space-between;align-items:center"><span class="score">${h.rating.toFixed(1)}</span><span><span class="muted small">${t('from')}</span> <b>${money(h.fromPrice, h.currency)}</b></span></div></div></a>`).join('')}</div></div>
  <div class="sec"><h2>${t('popular')}</h2><div class="grid g3">${S.meta.cities.map((c) => `<a class="dest" href="#/search?q=${encodeURIComponent(c.city)}&${stayQs({ checkIn: plus(14), checkOut: plus(16) })}" style="background-image:url('https://images.unsplash.com/${dest[c.city] || 'photo-1566073771259-6a8506099945'}?auto=format&fit=crop&w=600&q=60'),${FALLBACK}"><div><b>${esc(c.city)}</b><small>${esc(c.country)} · ${c.n} ${t('properties')}</small></div></a>`).join('')}</div></div>
  ${S.user ? '' : `<div class="card pad" style="text-align:center"><b>${t('hotelOwner')}</b> — <a href="#/register?type=hotel">${t('register')} →</a></div>`}</div>`;
  bindSearch();
});

R(/^\/destinations$/, async (app) => {
  const dest = { Baku: 'photo-1597043709571-5d3f4d7a4a8c', Tashkent: 'photo-1565008576549-57569a49371d', Samarkand: 'photo-1596484552834-6a58f850e0a1', Bukhara: 'photo-1590079070277-f5a0b3b3cf0c', Gabala: 'photo-1506905925346-21bda4d32df4', Sheki: 'photo-1469474968028-56623f02e42e', Khiva: 'photo-1528127269322-539801943592' };
  app.innerHTML = `<div class="wrap sec"><h1>${t('destinations')}</h1><div class="grid g3">${S.meta.cities.map((c) => `<a class="dest" href="#/search?q=${encodeURIComponent(c.city)}&${stayQs({ checkIn: plus(14), checkOut: plus(16) })}" style="background-image:url('https://images.unsplash.com/${dest[c.city] || 'photo-1566073771259-6a8506099945'}?auto=format&fit=crop&w=600&q=60'),${FALLBACK}"><div><b>${esc(c.city)}</b><small>${esc(c.country)} · ${c.n} ${t('properties')}</small></div></a>`).join('')}</div></div>`;
});

/* ---------- search ---------- */
R(/^\/search$/, async (app, m, q) => {
  q.checkIn ||= plus(14); q.checkOut ||= plus(16);
  const am = [].concat(q.amenity || []);
  const params = new URLSearchParams({ ...q, currency: S.cur });
  const d = await api('/hotels?' + params);
  const keep = (k, v) => { const p = new URLSearchParams(q); if (v === '' || v == null) p.delete(k); else p.set(k, v); location.hash = '#/search?' + p; };
  app.innerHTML = `<section class="hero2 mini" style="background-image:url('https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=2000&q=60'),linear-gradient(160deg,#0b3550,#07202f 70%)"><div class="wrap in"><div class="htitle"><h1>${esc(q.q || t('explore'))}</h1><div class="loc">${d.results.length} ${t('results')}</div></div>${searchBox(q, 'hero')}</div></section><div class="wrap sec"><div class="layout"><aside class="card filters"><b>${t('filters')}</b>
   <h4>${t('stars')}</h4><select id="f-stars"><option value="">—</option>${[3, 4, 5].map((n) => `<option value="${n}" ${q.stars == n ? 'selected' : ''}>${n}★ +</option>`).join('')}</select>
   <h4>${t('meal')}</h4><select id="f-meal"><option value="">${t('anyMeal')}</option>${['RO', 'BB', 'HB', 'FB'].map((x) => `<option value="${x}" ${q.meal === x ? 'selected' : ''}>${t('m' + x)}</option>`).join('')}</select>
   <h4>${t('priceRange')} (${S.cur})</h4><div class="row"><input id="f-min" type="number" placeholder="${t('min')}" value="${esc(q.minPrice || '')}"><input id="f-max" type="number" placeholder="${t('max')}" value="${esc(q.maxPrice || '')}"></div>
   <h4>${t('amenities')}</h4>${Object.keys(AMEN).map((a) => `<label class="chk"><input type="checkbox" value="${a}" ${am.includes(a) ? 'checked' : ''}> ${AMEN[a]} ${t(a)}</label>`).join('')}
  </aside><section><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px"><b>${d.results.length} ${t('results')}</b>
   <select id="f-sort" style="width:auto">${[['rating', 'sortRating'], ['price', 'sortPrice'], ['priceDesc', 'sortPriceDesc'], ['stars', 'sortStars']].map(([v, l]) => `<option value="${v}" ${q.sort === v ? 'selected' : ''}>${t(l)}</option>`).join('')}</select></div>
   ${d.results.length ? d.results.map((h) => hotelCard(h, d.nights, q)).join('') : `<div class="card pad">${t('noResults')}</div>`}</section></div></div>`;
  bindSearch();
  $('#f-stars').onchange = (e) => keep('stars', e.target.value);
  $('#f-meal').onchange = (e) => keep('meal', e.target.value);
  $('#f-sort').onchange = (e) => keep('sort', e.target.value);
  $('#f-min').onchange = (e) => keep('minPrice', e.target.value);
  $('#f-max').onchange = (e) => keep('maxPrice', e.target.value);
  document.querySelectorAll('.filters input[type=checkbox]').forEach((c) => (c.onchange = () => {
    const p = new URLSearchParams(q); p.delete('amenity');
    document.querySelectorAll('.filters input[type=checkbox]:checked').forEach((x) => p.append('amenity', x.value));
    location.hash = '#/search?' + p;
  }));
});
function hotelCard(h, nights, q) {
  return `<article class="card hcard"><div class="img" ${bg(h.image)}>${h.logo ? `<img class="clogo" src="${esc(h.logo)}" alt="">` : ''}</div><div class="body">${stars(h.stars)}<h3><a href="#/hotel/${h.id}?${stayQs(q)}">${esc(h.name)}</a></h3>
   <div class="muted small">📍 ${esc(h.city)}, ${esc(h.country)}</div><p class="small muted" style="margin:8px 0">${esc(h.description)}</p>
   <div>${h.amenities.slice(0, 5).map((a) => `<span class="tag">${AMEN[a] || ''} ${t(a)}</span>`).join('')}<span class="tag gold">${t('m' + h.meal)}</span></div>
   ${h.roomsLeft <= 3 ? `<div class="small" style="color:var(--bad);font-weight:700;margin-top:6px">${t('onlyLeft', { n: h.roomsLeft })}</div>` : ''}</div>
   <div class="side"><span class="score">${h.rating.toFixed(1)}</span><div>${h.priceType === 'agency' ? `<span class="tag green">${t('agencyRate')}</span><br>` : ''}<span class="muted small">${nights} ${t(nights > 1 ? 'nights' : 'night')}</span><div class="price">${money(h.total, h.currency)}</div><div class="muted small">${money(h.fromPrice, h.currency)} ${t('perNight')}</div></div>
   <a class="btn" href="#/hotel/${h.id}?${stayQs(q)}">${t('seeRooms')}</a></div></article>`;
}

/* ---------- hotel ---------- */
R(/^\/hotel\/(\d+)$/, async (app, m, q) => {
  q.checkIn ||= plus(14); q.checkOut ||= plus(16);
  const h = await api(`/hotels/${m[1]}?${new URLSearchParams({ ...q, currency: S.cur })}`);
  const im = h.images.length ? h.images : [''];
  app.innerHTML = `<section class="hero2 short" style="background-image:url('${esc(im[0])}'),linear-gradient(160deg,#0b3550,#07202f 70%)"><div class="ghost-word sm" aria-hidden="true">${esc(h.name.split(' ')[0])}</div><div class="wrap in"><div class="htitle">${h.logo ? `<img class="hlogo" src="${esc(h.logo)}" alt="${esc(h.name)}">` : ''}<div>${stars(h.stars)}</div><h1>${esc(h.name)}</h1><div class="loc"><span>📍 ${esc(h.address)}, ${esc(h.city)}, ${esc(h.country)}</span><span class="score">${h.rating.toFixed(1)}</span></div></div>${searchBox(q, 'hero')}</div></section>
   <div class="wrap sec"><div class="gallery"><div ${bg(im[0])}></div><div class="col"><div ${bg(im[1] || im[0])}></div><div ${bg(im[2] || im[0])}></div></div></div>
   ${(h.about || h.services.length) ? `<div class="card pad" style="margin-top:22px"><div class="grid g2">${h.about ? `<div><h3>${t('aboutUs')}</h3><p style="white-space:pre-wrap">${esc(h.about)}</p></div>` : ''}${h.services.length ? `<div><h3>${t('ourServices')}</h3><ul class="svc">${h.services.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}</div></div>` : ''}
   <div class="grid split" style="margin-top:22px"><div class="card pad"><h3>${t('about')}</h3><p>${esc(h.description)}</p><div>${h.amenities.map((a) => `<span class="tag">${AMEN[a] || ''} ${t(a)}</span>`).join('')}<span class="tag gold">${t('m' + h.meal)}</span></div></div>
    <div class="card pad small"><p><b>${t('checkInFrom')}:</b> ${esc(h.checkin)}<br><b>${t('checkOutUntil')}:</b> ${esc(h.checkout)}</p><p><b>${t('cancelPolicy')}:</b><br>${esc(h.cancelPolicy)}</p>${h.website ? `<a href="${esc(h.website)}" target="_blank" rel="noopener noreferrer">🌐 Website</a>` : ''} ${h.instagram ? `· <a href="${esc(h.instagram)}" target="_blank" rel="noopener noreferrer">Instagram</a>` : ''}</div></div>
   <h2 style="margin-top:28px">${t('roomsRates')}</h2>
   ${h.offers.map((o) => `<div class="card room"><div class="img" ${bg(o.image)}></div><div class="pad"><h3>${esc(o.name)}</h3><div class="muted small">🛏 ${esc(o.bed)} · 📐 ${o.area} m² · 👥 ${t('guestsMax')}: ${o.maxGuests}</div><div style="margin-top:8px">${o.amenities.map((a) => `<span class="tag">${AMEN[a] || ''} ${t(a) === a ? a : t(a)}</span>`).join('')}</div>${o.bookable && o.available <= 3 ? `<div class="small" style="color:var(--bad);font-weight:700;margin-top:8px">${t('onlyLeft', { n: o.available })}</div>` : ''}</div>
    <div class="side"><div>${o.priceType === 'agency' ? `<span class="tag green">${t('agencyRate')}</span><br>` : ''}<span class="muted small">${h.nights} ${t(h.nights > 1 ? 'nights' : 'night')}</span><div class="price">${money(o.total, o.currency)}</div><div class="muted small">${money(o.perNight, o.currency)} ${t('perNight')}</div></div>
    ${o.bookable ? `<a class="btn gold" href="#/checkout/${o.id}?${stayQs(q)}&hotel=${h.id}">${t('book')}</a>` : `<span class="tag red">${t('soldOut')}</span>`}</div></div>`).join('')}</div>`;
  bindSearch({ q: h.name });
});

/* ---------- checkout ---------- */
R(/^\/checkout\/(\d+)$/, async (app, m, q) => {
  if (!S.user) { sessionStorage.setItem('back', location.hash); location.hash = '#/login'; return; }
  const hotel = await api(`/hotels/${encodeURIComponent(q.hotel)}?${new URLSearchParams({ ...q, currency: S.cur })}`);
  const offer = hotel.offers.find((x) => x.id === Number(m[1]));
  if (!offer) throw new Error(t('soldOut'));
  track('checkout', String(hotel.id));
  const agencyOk = S.user.role === 'agency' && S.user.agency?.status === 'approved';
  app.innerHTML = `<div class="wrap sec"><div class="layout" style="grid-template-columns:1fr 340px"><form class="card pad" id="bf"><h2>${t('guestDetails')}</h2>
   <div class="row"><div class="field"><label>${t('fullName')} *</label><input name="name" required value="${esc(S.user.name || '')}"></div><div class="field"><label>${t('email')}</label><input type="email" name="email" required value="${esc(S.user.email)}"></div><div class="field"><label>${t('phone')} *</label><input name="phone" type="tel" required minlength="7" pattern="[+0-9 ()\\-]{7,20}" placeholder="+994 50 000 00 00" autocomplete="tel"></div></div>
   <h2 style="margin-top:20px">${t('payment')}</h2>
   ${hotel.payOptions.map((o, i) => `<label class="chk" style="display:flex;gap:8px;margin-bottom:8px;align-items:flex-start"><input type="radio" name="pay" value="${o}" ${i === 0 ? 'checked' : ''}> <span>${o === 'online' ? t('payOnline') : `${t('payProperty')}<br><span class="muted small">${t('payPropertyHint')}</span>`}</span></label>`).join('')}
   ${agencyOk ? `<label class="chk" style="display:flex;gap:8px"><input type="radio" name="pay" value="contract"> ${t('payContract')} <span class="muted small">(${t('available')}: ${money((S.user.agency.creditLimit - S.user.agency.debt) * (rateOf(S.cur)), S.cur)})</span></label>` : ''}
   <div id="err"></div><button class="btn gold" style="margin-top:18px;width:100%;padding:14px" id="go">${t('confirmBooking')}</button></form>
   <aside class="card pad"><div ${bg(hotel.images[0])} style="height:120px;border-radius:12px;background-size:cover;background-image:url('${esc(hotel.images[0])}'),${FALLBACK}"></div><h3 style="margin-top:12px;display:flex;align-items:center;gap:10px">${hotel.logo ? `<img src="${esc(hotel.logo)}" alt="" style="width:36px;height:36px;border-radius:10px;object-fit:cover">` : ''}${esc(hotel.name)}</h3><div class="muted small">${esc(offer.name)}</div><hr style="border:0;border-top:1px solid var(--line)">
   <p class="small">${esc(q.checkIn)} → ${esc(q.checkOut)}<br>${hotel.nights} ${t('nights')} · ${q.rooms || 1} ${t('rooms')} · ${q.adults || 2} ${t('adults')}</p>${offer.priceType === 'agency' ? `<span class="tag green">${t('agencyRate')}</span>` : ''}<div class="price">${money(offer.total, offer.currency)}</div><div class="muted small">${t('priceFinal')}</div></aside></div></div>`;
  const key = crypto.randomUUID();
  $('#bf').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    $('#go').disabled = true;
    try {
      const b = await api('/bookings', { method: 'POST', headers: { 'Idempotency-Key': key }, body: { roomTypeId: offer.id, checkIn: q.checkIn, checkOut: q.checkOut, rooms: +(q.rooms || 1), adults: +(q.adults || 2), children: +(q.children || 0), currency: S.cur, payMethod: f.get('pay'), guest: { name: f.get('name'), email: f.get('email'), phone: f.get('phone') } } });
      await loadUser(); renderTop();
      location.hash = b.status === 'on_hold' ? '#/pay/' + b.id : '#/booking/' + b.id;
    } catch (er) { $('#err').innerHTML = `<div class="err">${esc(er.message)}</div>`; $('#go').disabled = false; }
  };
});

R(/^\/pay\/(\d+)$/, async (app, m) => {
  const b = await api('/bookings/' + m[1]);
  if (b.status !== 'on_hold') { location.hash = '#/booking/' + b.id; return; }
  app.innerHTML = `<div class="wrap sec"><div class="auth" style="max-width:520px"><div class="card pad"><h2>${t('payment')}</h2><p><b>${esc(b.hotel)}</b> · ${esc(b.room)}<br><span class="muted small">${esc(b.checkIn)} → ${esc(b.checkOut)}</span></p><div class="price">${money(b.total, b.currency)}</div>
   <div class="notice small" style="margin-top:12px">⏱ ${t('holdNote', { m: 15 })} — <b id="cd"></b></div>
   <form id="pf"><div class="field"><label>${t('cardNumber')}</label><input name="number" inputmode="numeric" autocomplete="cc-number" placeholder="4242 4242 4242 4242" required></div>
   <div class="row"><div class="field"><label>${t('expiry')}</label><input placeholder="MM/YY" required></div><div class="field"><label>${t('cvc')}</label><input placeholder="123" required></div></div><p class="muted small">🔒 ${t('cardHint')}</p><div id="err"></div><button class="btn gold" style="width:100%;padding:14px">${t('payNow')} ${money(b.total, b.currency)}</button></form></div></div></div>`;
  const end = new Date(b.holdExpires).getTime();
  const tick = setInterval(() => { const s = Math.max(0, Math.floor((end - Date.now()) / 1000)); if (!$('#cd')) return clearInterval(tick); $('#cd').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 500);
  $('#pf').onsubmit = async (e) => {
    e.preventDefault();
    try { const r = await api(`/bookings/${b.id}/pay`, { method: 'POST', body: { card: { number: e.target.number.value } } }); if (r.redirectUrl) location.href = r.redirectUrl; else location.hash = '#/booking/' + b.id; }
    catch (er) { $('#err').innerHTML = `<div class="err">${esc(er.message)}</div>`; }
  };
});

const statusTag = (s) => `<span class="tag ${s === 'confirmed' ? 'green' : ['cancelled', 'failed', 'rejected'].includes(s) ? 'red' : 'gold'}">${t('s_' + s)}</span>`;
R(/^\/booking\/(\d+)$/, async (app, m) => {
  const b = await api('/bookings/' + m[1]);
  app.innerHTML = `<div class="wrap sec"><div class="auth" style="max-width:600px"><div class="card pad"><h2>${b.status === 'confirmed' ? '✅ ' + t('bookingConfirmed') : t('status')}</h2><p>${statusTag(b.status)} ${b.payMethod === 'property' ? `<span class="tag">${t('payProperty')}</span>` : ''}</p>
   <p class="muted">${t('bookingRef')}</p><div class="price">${esc(b.ref)}</div><hr style="border:0;border-top:1px solid var(--line)"><h3>${esc(b.hotel)}</h3><p>${esc(b.room)} · ${b.rooms} ${t('rooms')}<br>${esc(b.checkIn)} → ${esc(b.checkOut)} (${b.nights} ${t('nights')})<br>${esc(b.guest.name)} · ${esc(b.guest.email)}</p><div class="price">${money(b.total, b.currency)}</div>
   <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap"><a class="btn ghost" href="#/trips">${t('trips')}</a>${['confirmed', 'on_hold'].includes(b.status) ? `<button class="btn danger" id="cx">${t('cancel')}</button>` : ''}${b.status === 'on_hold' ? `<a class="btn gold" href="#/pay/${b.id}">${t('payNow')}</a>` : ''}</div></div></div></div>`;
  if ($('#cx')) $('#cx').onclick = async () => { if (!confirm(t('cancelConfirm'))) return; await api(`/bookings/${b.id}/cancel`, { method: 'POST' }); await loadUser(); renderTop(); route(); };
});
R(/^\/trips$/, async (app) => {
  if (!S.user) { location.hash = '#/login'; return; }
  const bs = await api('/bookings');
  app.innerHTML = `<div class="wrap sec"><h1>${t('trips')}</h1>${bs.length ? `<table><tr><th>${t('bookingRef')}</th><th>Hotel</th><th>${t('checkIn')}</th><th>${t('checkOut')}</th><th>${t('total')}</th><th>${t('status')}</th></tr>${bs.map((b) => `<tr><td><a href="#/booking/${b.id}">${esc(b.ref)}</a></td><td>${esc(b.hotel)}<br><span class="muted small">${esc(b.room)}</span></td><td>${esc(b.checkIn)}</td><td>${esc(b.checkOut)}</td><td>${money(b.total, b.currency)}</td><td>${statusTag(b.status)}</td></tr>`).join('')}</table>` : `<div class="card pad">${t('noTrips')}</div>`}</div>`;
});

/* ---------- auth ---------- */
R(/^\/login$/, async (app) => {
  app.innerHTML = `<div class="wrap"><div class="auth card pad"><h2>${t('signInTitle')}</h2><form id="lf"><div class="field"><label>${t('email')}</label><input type="email" name="email" required autocomplete="username"></div><div class="field"><label>${t('password')}</label><input type="password" name="password" required autocomplete="current-password"></div><div id="mfa"></div><p class="small" style="text-align:right;margin:-4px 0 10px"><a href="#/forgot">${t('forgot')}</a></p><div id="err"></div><button class="btn" style="width:100%">${t('login')}</button></form>
   <p class="small muted">${t('noAccount')} <a href="#/register">${t('register')}</a></p>
   <details class="small"><summary>${t('demo')}</summary><p>admin@hotel.local / Admin123!<br>tourist@hotel.local / Tourist123!<br>agency@hotel.local / Agency123! (${t('agency')} ✓)<br>agency2@hotel.local / Agency123! (pending)<br>hotel@hotel.local / Hotel123!</p></details></div></div>`;
  $('#lf').onsubmit = async (e) => {
    e.preventDefault();
    try { const f = Object.fromEntries(new FormData(e.target)); const d = await api('/auth/login', { method: 'POST', body: f, quiet: true }); afterAuth(d); }
    catch (er) {
      if (er.message.includes('code required')) $('#mfa').innerHTML = `<div class="field"><label>${t('mfaCode')}</label><input name="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" autofocus required></div>`;
      else $('#err').innerHTML = `<div class="err">${esc(er.message)}</div>`;
    }
  };
});
function afterAuth(d) {
  S.token = d.token; S.user = d.user; localStorage.setItem('tok', d.token); renderTop();
  const back = sessionStorage.getItem('back'); sessionStorage.removeItem('back');
  go(back || { admin: '#/admin', hotel: '#/cabinet', agency: '#/agency', tourist: '#/' }[d.user.role]);
}
R(/^\/register$/, async (app, m, q) => {
  let type = ['tourist', 'agency', 'hotel'].includes(q.type) ? q.type : 'tourist';
  const draw = () => {
    app.innerHTML = `<div class="wrap"><div class="auth card pad" style="max-width:520px"><h2>${t('register')}</h2><form id="rf">
    <div class="field"><label>${t('accountType')}</label><select id="ty">${['tourist', 'agency', 'hotel'].map((x) => `<option value="${x}" ${x === type ? 'selected' : ''}>${t(x)}</option>`).join('')}</select></div>
    <div class="row"><div class="field"><label>${t('fullName')}</label><input name="name" required></div><div class="field"><label>${t('phone')}</label><input name="phone"></div></div>
    <div class="field"><label>${t('email')}</label><input type="email" name="email" required autocomplete="username"></div><div class="field"><label>${t('password')} (8+)</label><input type="password" name="password" minlength="8" required autocomplete="new-password"></div>
    ${type === 'agency' ? `<div class="row"><div class="field"><label>${t('agencyName')}</label><input name="aname" required></div><div class="field"><label>${t('voen')}</label><input name="voen" required></div><div class="field"><label>${t('country')}</label><input name="acountry"></div></div><div class="notice small">${t('pendingAgency')}</div>` : ''}
    ${type === 'hotel' ? `<div class="field"><label>${t('hotelExisting')}</label><select name="hotelId"><option value="">— ${t('hotelNew')} —</option>${S.meta.hotelsForClaim.map((h) => `<option value="${h.id}">${esc(h.name)} (${esc(h.city)})</option>`).join('')}</select></div><div class="row"><div class="field"><label>${t('hotelName')}</label><input name="hname"></div><div class="field"><label>${t('city')}</label><input name="hcity"></div><div class="field"><label>${t('country')}</label><input name="hcountry"></div></div><div class="notice small">${t('pendingHotel')}</div>` : ''}
    <div id="err"></div><button class="btn" style="width:100%">${t('createAccount')}</button></form><p class="small muted">${t('haveAccount')} <a href="#/login">${t('login')}</a></p></div></div>`;
    $('#ty').onchange = (e) => { type = e.target.value; draw(); };
    $('#rf').onsubmit = async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      const body = { type, email: f.email, password: f.password, name: f.name, phone: f.phone };
      if (type === 'agency') body.agency = { name: f.aname, voen: f.voen, country: f.acountry };
      if (type === 'hotel') body.hotel = { hotelId: f.hotelId ? +f.hotelId : null, name: f.hname, city: f.hcity, country: f.hcountry };
      try { afterAuth(await api('/auth/register', { method: 'POST', body })); } catch (er) { $('#err').innerHTML = `<div class="err">${esc(er.message)}</div>`; }
    };
  };
  draw();
});

/* ---------- agency desk ---------- */
R(/^\/agency$/, async (app) => {
  if (S.user?.role !== 'agency') { location.hash = '#/login'; return; }
  await loadUser();
  const a = S.user.agency, bs = await api('/bookings');
  app.innerHTML = `<div class="wrap sec"><h1>${esc(a.name)} ${a.status === 'approved' ? '<span class="tag green">✔ ' + a.status + '</span>' : `<span class="tag gold">${esc(a.status)}</span>`}</h1>
   ${a.status !== 'approved' ? `<div class="notice">${t('pendingAgency')}</div>` : ''}
   <div class="kpi"><div><b>${money(a.creditLimit * rateOf(S.cur))}</b><span>${t('creditLimit')}</span></div><div><b>${money(a.debt * rateOf(S.cur))}</b><span>${t('debt')}</span></div><div><b>${bs.length}</b><span>${t('bookings')}</span></div></div>
   <p><a class="btn gold" href="#/search">${t('search')}</a></p><h2>${t('bookings')}</h2>${bookTable(bs)}</div>`;
});
const bookTable = (bs) => bs.length ? `<table><tr><th>${t('bookingRef')}</th><th>Hotel</th><th>${t('fullName')}</th><th>${t('checkIn')}</th><th>${t('checkOut')}</th><th>${t('total')}</th><th>${t('status')}</th></tr>${bs.map((b) => `<tr><td><a href="#/booking/${b.id}">${esc(b.ref)}</a></td><td>${esc(b.hotel)}</td><td>${esc(b.guest.name)}</td><td>${esc(b.checkIn)}</td><td>${esc(b.checkOut)}</td><td>${money(b.total, b.currency)}</td><td>${statusTag(b.status)}</td></tr>`).join('')}</table>` : `<div class="card pad">${t('noTrips')}</div>`;

/* ---------- hotel cabinet ---------- */
const readDataUrl = (file) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(new Error('Cannot read file')); r.readAsDataURL(file); });
async function uploadImage(file) {
  if (!file) return null;
  if (file.size > 500 * 1024) throw new Error(t('imgTooBig'));
  return (await api('/hotel/upload', { method: 'POST', body: { dataUrl: await readDataUrl(file) } })).url;
}
const HOTEL_AMEN_KEYS = ['wifi', 'pool', 'spa', 'parking', 'restaurant', 'gym', 'ac'];
const ROOM_AMEN_KEYS = ['wifi', 'tv', 'ac', 'minibar', 'balcony', 'bathtub', 'kettle', 'safe'];
R(/^\/cabinet$/, async (app, m, q) => {
  if (S.user?.role !== 'hotel') { location.hash = '#/login'; return; }
  const st = await api('/hotel/status');
  if (!st.linked) { app.innerHTML = '<div class="wrap sec"><div class="notice">' + t('pendingHotel') + ' (' + esc(st.claim?.status || '') + ')</div></div>'; return; }
  const d = await api('/hotel/me');
  const h = d.hotel, cur = h.currency, tab = q.tab || 'profile';
  const tabs = [['profile', 'cabProfile'], ['rooms', 'cabRooms'], ['inventory', 'inventory'], ['bookings', 'bookings']];
  const ck = (name, list, sel) => list.map((a) => '<label class="chk" style="display:inline-flex;gap:6px;margin:0 14px 6px 0"><input type="checkbox" name="' + name + '" value="' + a + '" ' + (sel.includes(a) ? 'checked' : '') + '> ' + (t(a) === a ? a : t(a)) + '</label>').join('');
  const head = '<div style="display:flex;align-items:center;gap:14px;margin-bottom:18px">' + (h.logo ? '<img class="hlogo" style="margin:0;border-color:var(--line)" src="' + esc(h.logo) + '" alt="">' : '<div class="ico">🏨</div>') + '<h1 style="margin:0">' + esc(h.name) + ' <small class="muted">' + esc(h.city) + '</small></h1></div><div class="tabs">' + tabs.map(([k, l]) => '<button class="' + (k === tab ? 'on' : '') + '" data-t="' + k + '">' + t(l) + '</button>').join('') + '</div>';
  const shell = (inner) => { app.innerHTML = '<div class="wrap sec">' + head + inner + '</div>'; document.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => (location.hash = '#/cabinet?tab=' + b.dataset.t))); };
  const fail = (er) => toast(er.message);

  if (tab === 'profile') {
    shell('<form id="pf" class="card pad">' +
      '<div class="row" style="align-items:flex-end"><div class="field" style="flex:0 0 120px">' + (h.logo ? '<img src="' + esc(h.logo) + '" alt="" style="width:100px;height:100px;border-radius:18px;object-fit:cover;border:1px solid var(--line)">' : '<div class="ico" style="width:100px;height:100px;font-size:40px">🏨</div>') + '</div>' +
      '<div class="field"><label>' + t('logo') + '</label><input type="file" id="logo" accept="image/png,image/jpeg,image/webp"><div class="muted small">' + t('logoHint') + '</div></div>' + (h.logo ? '<div class="field" style="flex:0 0 auto"><button type="button" class="btn sm danger" id="rmlogo">' + t('removeLogo') + '</button></div>' : '') + '</div>' +
      '<div class="row"><div class="field"><label>' + t('hotelCurrency') + '</label><select name="currency">' + (S.meta.currencies || ['USD']).map((c) => '<option ' + (c === cur ? 'selected' : '') + '>' + c + '</option>').join('') + '</select></div>' +
      '<div class="field" style="flex:2"><label class="chk" style="display:flex;gap:8px;margin-top:26px"><input type="checkbox" name="convertPrices" checked> ' + t('convertPrices') + '</label><div class="muted small">' + t('currencyHint') + '</div></div></div>' +
      '<div class="field"><label>' + t('shortDesc') + '</label><textarea name="description" rows="2" maxlength="600">' + esc(h.description) + '</textarea></div>' +
      '<div class="field"><label>' + t('aboutUs') + '</label><textarea name="about" rows="6" maxlength="5000" placeholder="' + esc(t('aboutPh')) + '">' + esc(h.about) + '</textarea></div>' +
      '<div class="field"><label>' + t('servicesList') + '</label><textarea name="servicesText" rows="5" maxlength="3000" placeholder="' + esc(t('servicesPh')) + '">' + esc(h.servicesText) + '</textarea><div class="muted small">' + t('servicesHint') + '</div></div>' +
      '<div class="field"><label>' + t('facilities') + '</label>' + ck('amenities', HOTEL_AMEN_KEYS, h.amenities) + '</div>' +
      '<div class="row"><div class="field"><label>Website (https://)</label><input name="website" value="' + esc(h.website || '') + '"></div><div class="field"><label>Instagram (https://)</label><input name="instagram" value="' + esc(h.instagram || '') + '"></div></div>' +
      '<div class="field"><label>' + t('cancelPolicy') + '</label><input name="cancelPolicy" maxlength="300" value="' + esc(h.cancelPolicy || '') + '"></div>' +
      '<div class="field"><label>' + t('payTerms') + '</label><select name="paymentPolicy"><option value="both" ' + (h.paymentPolicy === 'both' ? 'selected' : '') + '>' + t('polBoth') + '</option><option value="online" ' + (h.paymentPolicy === 'online' ? 'selected' : '') + '>' + t('polOnline') + '</option><option value="property" ' + (h.paymentPolicy === 'property' ? 'selected' : '') + '>' + t('polProperty') + '</option></select></div>' +
      '<button class="btn gold">' + t('save') + '</button></form>');
    $('#logo').onchange = async (e) => { try { const url = await uploadImage(e.target.files[0]); if (url) { await api('/hotel/me', { method: 'PATCH', body: { logo: url } }); toast(t('saved')); route(); } } catch (er) { fail(er); } };
    if ($('#rmlogo')) $('#rmlogo').onclick = async () => { await api('/hotel/me', { method: 'PATCH', body: { logo: '' } }); route(); };
    $('#pf').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const body = { description: f.get('description'), about: f.get('about'), servicesText: f.get('servicesText'), amenities: f.getAll('amenities'), website: f.get('website'), instagram: f.get('instagram'), cancelPolicy: f.get('cancelPolicy'), paymentPolicy: f.get('paymentPolicy') };
      if (f.get('currency') !== cur) { if (!confirm(t('currencyConfirm', { a: cur, b: f.get('currency') }))) return; body.currency = f.get('currency'); body.convertPrices = !!f.get('convertPrices'); }
      try { await api('/hotel/me', { method: 'PATCH', body }); toast(t('saved')); route(); } catch (er) { fail(er); }
    };
  } else if (tab === 'rooms') {
    shell('<div class="card pad" style="margin-bottom:20px"><h2>' + t('addRoom') + '</h2><form id="nr"><div class="row">' +
      '<div class="field" style="flex:2"><label>' + t('roomName') + ' *</label><input name="name" required maxlength="80" placeholder="Deluxe Sea View"></div><div class="field"><label>' + t('guestsMax') + '</label><input type="number" name="maxGuests" min="1" max="20" value="2"></div>' +
      '<div class="field"><label>' + t('bed') + '</label><input name="bed" placeholder="1 king bed"></div><div class="field"><label>' + t('area') + '</label><input type="number" name="area" min="5" max="1000" placeholder="m²"></div>' +
      '<div class="field"><label>' + t('price') + ' (' + cur + ') *</label><input type="number" step="0.01" min="0.01" name="basePrice" required></div><div class="field"><label>' + t('quantity') + '</label><input type="number" name="count" min="0" max="500" value="5"></div></div>' +
      '<div class="field"><label>' + t('roomFacilities') + '</label>' + ck('amenities', ROOM_AMEN_KEYS, ['wifi', 'tv']) + '</div><div class="field"><label>' + t('photo') + '</label><input type="file" name="photo" accept="image/png,image/jpeg,image/webp"></div><button class="btn gold">' + t('addRoom') + '</button></form></div>' +
      '<h2>' + t('cabRooms') + '</h2><table><tr><th>' + t('roomName') + '</th><th>' + t('guestsMax') + '</th><th>' + t('bed') + '</th><th>m²</th><th>' + t('price') + ' (' + cur + ')</th><th>' + t('quantity') + '</th><th></th></tr>' +
      d.rooms.map((r) => '<tr data-r="' + r.id + '"><td><input name="name" value="' + esc(r.name) + '" style="min-width:160px"></td><td><input name="maxGuests" type="number" min="1" max="20" value="' + r.maxGuests + '" style="width:70px"></td><td><input name="bed" value="' + esc(r.bed || '') + '" style="min-width:110px"></td><td><input name="area" type="number" value="' + (r.area || '') + '" style="width:70px"></td><td><input name="basePrice" type="number" step="0.01" value="' + r.basePrice + '" style="width:110px"></td><td><input name="count" type="number" min="0" max="500" value="' + r.count + '" style="width:70px"></td><td style="white-space:nowrap"><button class="btn sm" data-save="' + r.id + '">' + t('save') + '</button> <button class="btn sm danger" data-del="' + r.id + '">' + t('delete') + '</button></td></tr>').join('') + '</table>');
    $('#nr').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        const image = await uploadImage(f.get('photo') && f.get('photo').size ? f.get('photo') : null);
        await api('/hotel/rooms', { method: 'POST', body: { name: f.get('name'), maxGuests: +f.get('maxGuests'), bed: f.get('bed'), area: f.get('area') ? +f.get('area') : null, basePrice: +f.get('basePrice'), count: +f.get('count'), amenities: f.getAll('amenities'), image } });
        toast(t('saved')); route();
      } catch (er) { fail(er); }
    };
    document.querySelectorAll('[data-save]').forEach((b) => (b.onclick = async () => {
      const row = document.querySelector('tr[data-r="' + b.dataset.save + '"]'), v = (n) => row.querySelector('[name=' + n + ']').value;
      try { await api('/hotel/rooms/' + b.dataset.save, { method: 'PATCH', body: { name: v('name'), maxGuests: +v('maxGuests'), bed: v('bed'), area: v('area') ? +v('area') : null, basePrice: +v('basePrice'), count: +v('count') } }); toast(t('saved')); } catch (er) { fail(er); }
    }));
    document.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => { if (!confirm(t('confirmDelete'))) return; try { await api('/hotel/rooms/' + b.dataset.del, { method: 'DELETE' }); route(); } catch (er) { fail(er); } }));
  } else if (tab === 'inventory') {
    shell('<div class="card pad"><h2>' + t('inventory') + '</h2><form id="inv"><div class="row"><div class="field"><label>' + t('roomName') + '</label><select name="room">' + d.rooms.map((r) => '<option value="' + r.id + '">' + esc(r.name) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>' + t('from_') + '</label><input type="date" name="from" min="' + plus(0) + '" value="' + plus(1) + '" required></div><div class="field"><label>' + t('to_') + '</label><input type="date" name="to" min="' + plus(0) + '" value="' + plus(30) + '"></div>' +
      '<div class="field"><label>' + t('availableRooms') + '</label><input type="number" name="available" min="0"></div><div class="field"><label>' + t('price') + ' (' + cur + ' / ' + t('perRoom') + ')</label><input type="number" step="0.01" min="0.01" name="price"></div>' +
      '<div class="field"><label>' + t('closed') + '</label><select name="closed"><option value="">—</option><option value="1">✔</option><option value="0">✘</option></select></div></div><button class="btn">' + t('save') + '</button></form></div>');
    $('#inv').onsubmit = async (e) => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
      const body = { from: f.from, to: f.to || undefined };
      if (f.available !== '') body.available = +f.available; if (f.price !== '') body.price = +f.price; if (f.closed !== '') body.closed = f.closed === '1';
      try { await api('/hotel/rooms/' + f.room + '/inventory', { method: 'PUT', body }); toast(t('saved')); } catch (er) { fail(er); }
    };
  } else {
    shell(d.bookings.length ? '<table><tr><th>' + t('bookingRef') + '</th><th>' + t('fullName') + '</th><th>' + t('phone') + '</th><th>' + t('roomName') + '</th><th>' + t('checkIn') + '</th><th>' + t('checkOut') + '</th><th>' + t('hotelPayable') + '</th><th>' + t('payment') + '</th><th>' + t('status') + '</th><th>' + t('roomNumber') + '</th></tr>' +
      d.bookings.map((b) => '<tr><td>' + esc(b.ref) + '</td><td>' + esc(b.guest.name) + '</td><td>' + esc(b.guest.phone) + '</td><td>' + esc(b.room) + '</td><td>' + esc(b.checkIn) + '</td><td>' + esc(b.checkOut) + '</td><td>' + money(b.hotelPayable, b.hotelCurrency) + '</td><td><span class="tag">' + esc(b.payMethod) + '</span></td><td>' + statusTag(b.status) + '</td><td><input style="width:80px" value="' + esc(b.roomNumber || '') + '" data-rn="' + b.id + '"></td></tr>').join('') + '</table>' : '<div class="card pad">' + t('noTrips') + '</div>');
    document.querySelectorAll('[data-rn]').forEach((i) => (i.onchange = () => api('/hotel/bookings/' + i.dataset.rn, { method: 'PATCH', body: { roomNumber: i.value } }).then(() => toast(t('saved')))));
  }
});

/* ---------- admin ---------- */
R(/^\/admin$/, async (app, m, q) => {
  if (S.user?.role !== 'admin') { location.hash = '#/login'; return; }
  const tab = q.tab || 'dashboard';
  const tabs = [['dashboard', 'dashboard'], ['bookings', 'bookings'], ['hotels', 'hotels'], ['claims', 'claims'], ['agencies', 'agencies'], ['rules', 'rules'], ['integrations', 'integrations'], ['content', 'content'], ['users', 'users'], ['audit', 'audit']];
  const shell = (inner) => { app.innerHTML = `<div class="wrap sec"><div class="tabs">${tabs.map(([k, l]) => `<button class="${k === tab ? 'on' : ''}" data-t="${k}">${t(l)}</button>`).join('')}</div>${inner}</div>`; document.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => (location.hash = '#/admin?tab=' + b.dataset.t))); };
  const act = (sel, fn) => document.querySelectorAll(sel).forEach((b) => (b.onclick = async () => { try { await fn(b); route(); } catch (e) { toast(e.message); } }));
  const usd = (n) => '$' + Number(n || 0).toFixed(2);
  if (tab === 'dashboard') {
    const s = await api('/admin/stats'); const f = s.funnel, mx = Math.max(f.searches, 1);
    shell(`<div class="kpi"><div><b>${s.bookings}</b><span>${t('bookings')}</span></div><div><b>${usd(s.grossUsd)}</b><span>${t('grossUsd')}</span></div><div><b>${usd(s.hotelPayableUsd)}</b><span>${t('hotelPayable')}</span></div><div><b>${usd(s.revenueUsd)}</b><span>${t('revenue')}</span></div><div><b>${s.agenciesPending}</b><span>${t('agencies')} ⏳</span></div><div><b>${s.claimsNew}</b><span>${t('claims')} ⏳</span></div></div>
    <div class="grid g2"><div class="card pad"><h3>${t('funnel')}</h3>${[['searches', f.searches], ['views', f.hotelViews], ['checkouts', f.checkoutStarts], ['bookings', f.bookings]].map(([l, v]) => `<div class="small" style="margin-top:10px">${t(l)} <b>${v}</b></div><div class="bar"><i style="width:${Math.min(100, v / mx * 100)}%"></i></div>`).join('')}</div>
    <div class="card pad"><h3>${t('status')}</h3>${s.byStatus.map((x) => `<div style="display:flex;justify-content:space-between;padding:4px 0">${statusTag(x.status)}<b>${x.n}</b></div>`).join('')}<h3 style="margin-top:16px">Channels</h3>${s.byChannel.map((x) => `<div style="display:flex;justify-content:space-between;padding:4px 0"><span class="tag">${esc(x.channel)}</span><b>${x.n} · ${usd(x.usd)}</b></div>`).join('')}</div></div>`);
  } else if (tab === 'bookings') {
    const bs = await api('/admin/bookings');
    shell(`<table><tr><th>Ref</th><th>Hotel</th><th>Channel</th><th>Dates</th><th>USD</th><th>Hotel pays</th><th>Revenue</th><th>${t('status')}</th><th></th></tr>${bs.map((b) => `<tr><td>${esc(b.ref)}</td><td>${esc(b.hotel)}<br><span class="muted small">${esc(b.guest.name)}</span></td><td><span class="tag">${esc(b.channel)}</span> ${esc(b.snapshot.model || '')}</td><td>${esc(b.checkIn)} → ${esc(b.checkOut)}</td><td>${usd(b.totalUsd)}</td><td>${usd(b.snapshot.hotelPayable)}</td><td>${usd(b.snapshot.platformRevenue)}</td><td>${statusTag(b.status)}</td><td>${['confirmed', 'on_hold'].includes(b.status) ? `<button class="btn sm danger" data-cx="${b.id}">${t('cancel')}</button>` : ''}</td></tr>`).join('')}</table>`);
    act('[data-cx]', (b) => api(`/admin/bookings/${b.dataset.cx}/status`, { method: 'POST', body: { status: 'cancelled' } }));
  } else if (tab === 'hotels') {
    const hs = await api('/admin/hotels');
    shell(`<div class="card pad" style="margin-bottom:16px"><h3>${t('addHotel')}</h3><form id="ah" class="row"><div class="field"><input name="name" placeholder="${t('hotelName')}" required></div><div class="field"><input name="city" placeholder="${t('city')}" required></div><div class="field"><input name="country" placeholder="${t('country')}" required></div><div class="field"><select name="priceModel"><option value="netto">NETTO</option><option value="brutto">BRUTTO</option></select></div><div class="field"><input name="basePrice" type="number" placeholder="USD" min="1"></div><button class="btn">+</button></form></div>
    <table><tr><th>ID</th><th>${t('hotelName')}</th><th>${t('stars')}</th><th>Model</th><th>Source</th><th>${t('status')}</th><th></th></tr>${hs.map((h) => `<tr><td>${h.id}</td><td>${esc(h.name)}<br><span class="muted small">${esc(h.city)}, ${esc(h.country)}</span></td><td>${h.stars}</td><td><select data-pm="${h.id}" style="width:auto"><option ${h.priceModel === 'netto' ? 'selected' : ''}>netto</option><option ${h.priceModel === 'brutto' ? 'selected' : ''}>brutto</option></select></td><td>${esc(h.source)}</td><td><span class="tag ${h.status === 'approved' ? 'green' : 'red'}">${esc(h.status)}</span></td><td><button class="btn sm ghost" data-hs="${h.id}" data-to="${h.status === 'approved' ? 'hidden' : 'approved'}">${h.status === 'approved' ? t('hide') : t('show')}</button></td></tr>`).join('')}</table>`);
    $('#ah').onsubmit = async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); if (!f.basePrice) delete f.basePrice; f.basePrice = f.basePrice && +f.basePrice; try { await api('/admin/hotels', { method: 'POST', body: f }); route(); } catch (er) { toast(er.message); } };
    act('[data-hs]', (b) => api('/admin/hotels/' + b.dataset.hs, { method: 'PATCH', body: { status: b.dataset.to } }));
    document.querySelectorAll('[data-pm]').forEach((s) => (s.onchange = () => api('/admin/hotels/' + s.dataset.pm, { method: 'PATCH', body: { priceModel: s.value } }).then(() => toast(t('saved')))));
  } else if (tab === 'claims') {
    const cs = await api('/admin/claims');
    shell(`<table><tr><th>#</th><th>User</th><th>Hotel</th><th>${t('note')}</th><th>${t('status')}</th><th></th></tr>${cs.map((c) => `<tr><td>${c.id}</td><td>${esc(c.email)}</td><td>${esc(c.hotel_name || c.new_name)} ${c.hotel_id ? '' : '<span class="tag gold">new</span>'}</td><td>${esc(c.note)}</td><td><span class="tag">${esc(c.status)}</span></td><td>${c.status === 'approved' || c.status === 'rejected' ? '' : `<button class="btn sm ok" data-cs="approved" data-id="${c.id}">${t('approve')}</button> <button class="btn sm danger" data-cs="rejected" data-id="${c.id}">${t('reject')}</button>`}</td></tr>`).join('')}</table>`);
    act('[data-cs]', (b) => api('/admin/claims/' + b.dataset.id, { method: 'PATCH', body: { status: b.dataset.cs } }));
  } else if (tab === 'agencies') {
    const ags = await api('/admin/agencies');
    shell(`<table><tr><th>#</th><th>${t('agencyName')}</th><th>${t('voen')}</th><th>${t('status')}</th><th>${t('creditLimit')} USD</th><th>${t('debt')}</th><th></th></tr>${ags.map((a) => `<tr><td>${a.id}</td><td>${esc(a.name)}<br><span class="muted small">${esc(a.country)} ${esc(a.contact)}</span></td><td>${esc(a.voen)}</td><td><span class="tag ${a.status === 'approved' ? 'green' : 'gold'}">${esc(a.status)}</span></td><td><input type="number" style="width:110px" value="${a.creditLimit}" data-cl="${a.id}"></td><td>${usd(a.debt)}</td><td>${a.status !== 'approved' ? `<button class="btn sm ok" data-as="approved" data-id="${a.id}">${t('approve')}</button> ` : ''}${a.status !== 'rejected' ? `<button class="btn sm danger" data-as="rejected" data-id="${a.id}">${t('reject')}</button>` : ''}</td></tr>`).join('')}</table>`);
    act('[data-as]', (b) => api('/admin/agencies/' + b.dataset.id, { method: 'PATCH', body: { status: b.dataset.as } }));
    document.querySelectorAll('[data-cl]').forEach((i) => (i.onchange = () => api('/admin/agencies/' + i.dataset.cl, { method: 'PATCH', body: { creditLimit: +i.value } }).then(() => toast(t('saved'))).catch((e) => toast(e.message))));
  } else if (tab === 'rules') {
    const rs = await api('/admin/rules');
    shell(`<div class="card pad" style="margin-bottom:16px"><h3>${t('addRule')}</h3><p class="muted small">markup: BRUTTO = NETTO × (1 + %) · agency_discount: agency = BRUTTO × (1 − %) · commission: hotel commission (BRUTTO model)</p><form id="ar" class="row">
    <div class="field"><label>${t('kind')}</label><select name="kind"><option>markup</option><option>agency_discount</option><option>commission</option></select></div><div class="field"><label>${t('scope')}</label><select name="scope">${['platform', 'country', 'hotel', 'room', 'agency'].map((x) => `<option>${x}</option>`).join('')}</select></div>
    <div class="field"><label>${t('scopeRef')}</label><input name="scopeRef" placeholder="Uzbekistan / 3 …"></div><div class="field"><label>${t('percent')}</label><input name="percent" type="number" step="0.01" min="0" max="99.99" required></div>
    <div class="field"><label>${t('dateFrom')}</label><input type="date" name="dateFrom"></div><div class="field"><label>${t('dateTo')}</label><input type="date" name="dateTo"></div><div class="field"><label>&nbsp;</label><button class="btn">+</button></div></form><div id="err"></div></div>
    <table><tr><th>#</th><th>${t('kind')}</th><th>${t('scope')}</th><th>%</th><th>${t('dateFrom')}</th><th>${t('dateTo')}</th><th></th></tr>${rs.map((r) => `<tr style="${r.active ? '' : 'opacity:.45'}"><td>${r.id}</td><td>${esc(r.kind)}</td><td>${esc(r.scope)} ${esc(r.scope_ref || '')}</td><td>${r.percent}</td><td>${esc(r.date_from || '—')}</td><td>${esc(r.date_to || '—')}</td><td>${r.active ? `<button class="btn sm ghost" data-rd="${r.id}">${t('deactivate')}</button>` : ''}</td></tr>`).join('')}</table>`);
    $('#ar').onsubmit = async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); f.percent = +f.percent; try { await api('/admin/rules', { method: 'POST', body: f }); route(); } catch (er) { $('#err').innerHTML = `<div class="err">${esc(er.message)}</div>`; } };
    act('[data-rd]', (b) => api('/admin/rules/' + b.dataset.rd, { method: 'DELETE' }));
  } else if (tab === 'integrations') {
    const i = await api('/admin/integrations');
    shell(`<div class="kpi"><div><b>${esc(i.payment)}</b><span>Payment provider</span></div>${Object.entries(i.outbox.channels).map(([k, v]) => `<div><b>${v ? '✅' : '—'}</b><span>${k}</span></div>`).join('')}</div>
    <div class="card pad" style="margin-bottom:16px"><h3>Suppliers / PMS</h3><table><tr><th>Supplier</th><th>Adapter</th><th>Last sync</th><th>Status</th><th></th></tr>${i.suppliers.map((x) => `<tr><td>${esc(x.name)}</td><td>${esc(x.adapter)}</td><td>${esc(x.lastSync || '—')}</td><td>${x.lastStatus === 'ok' ? '<span class="tag green">ok</span>' : `<span class="tag red">${esc(x.lastStatus || '—')}</span> ${esc(x.lastError || '')}`}</td><td><button class="btn sm" data-sync="${x.id}">Sync now</button></td></tr>`).join('')}</table></div>
    <div class="card pad" style="margin-bottom:16px"><h3>Currency rates (per 1 USD)</h3><form id="rt" class="row">${['EUR', 'RUB', 'AZN', 'UZS'].map((c) => `<div class="field"><label>${c}</label><input name="${c}" type="number" step="0.0001" value="${i.rates[c]}"></div>`).join('')}<div class="field"><label>&nbsp;</label><button class="btn">${t('save')}</button></div></form></div>
    <div class="card pad"><h3>Outbox (Telegram · CRM · Sheets · Email) <button class="btn sm ghost" id="pr">Process now</button></h3><table><tr><th>#</th><th>Channel</th><th>Status</th><th>Attempts</th><th>Error</th><th></th></tr>${i.outbox.recent.map((o) => `<tr><td>${o.id}</td><td>${esc(o.channel)}</td><td><span class="tag ${o.status === 'done' ? 'green' : o.status === 'failed' ? 'red' : 'gold'}">${esc(o.status)}</span></td><td>${o.attempts}</td><td class="small muted">${esc(o.error || '')}</td><td>${o.status === 'failed' ? `<button class="btn sm ghost" data-ob="${o.id}">Retry</button>` : ''}</td></tr>`).join('')}</table></div>`);
    act('[data-sync]', (b) => api('/admin/suppliers/' + b.dataset.sync + '/sync', { method: 'POST' }));
    act('[data-ob]', (b) => api('/admin/outbox/' + b.dataset.ob + '/retry', { method: 'POST' }));
    $('#pr').onclick = async () => { await api('/admin/outbox/process', { method: 'POST' }); route(); };
    $('#rt').onsubmit = async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); try { await api('/admin/rates', { method: 'PUT', body: { EUR: +f.EUR, RUB: +f.RUB, AZN: +f.AZN, UZS: +f.UZS } }); S.meta = await api('/meta'); toast(t('saved')); route(); } catch (er) { toast(er.message); } };
  } else if (tab === 'content') {
    const ps = await api('/admin/pages');
    const ct = { ...CONTACT_DEF, ...(S.meta.contact || {}) };
    shell(`<div class="card pad" style="margin-bottom:16px"><h3>${t('contactTitle')}</h3><form id="ctf" class="row">${['phone', 'email', 'telegram', 'whatsapp', 'facebook', 'instagram'].map((k) => `<div class="field"><label>${k}</label><input name="${k}" value="${esc(ct[k] || '')}"></div>`).join('')}<div class="field"><label>&nbsp;</label><button class="btn">${t('save')}</button></div></form><p class="muted small">Social links must start with https://</p></div>
    <div class="card pad"><h3>CMS pages</h3><form id="cp"><div class="row"><div class="field"><label>Slug</label><input name="slug" value="about" pattern="[a-z0-9-]+" required></div><div class="field"><label>Lang</label><select name="lang"><option>en</option><option>az</option><option>ru</option><option>uz</option></select></div><div class="field"><label>Title</label><input name="title" required></div></div><div class="field"><label>Body</label><textarea name="body" rows="6"></textarea></div><button class="btn">${t('save')}</button></form></div>
    <table style="margin-top:16px"><tr><th>Slug</th><th>Lang</th><th>Title</th></tr>${ps.map((p) => `<tr><td>${esc(p.slug)}</td><td>${esc(p.lang)}</td><td>${esc(p.title)}</td></tr>`).join('')}</table>`);
    $('#ctf').onsubmit = async (e) => { e.preventDefault(); try { S.meta.contact = await api('/admin/settings/contact', { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); renderTop(); toast(t('saved')); } catch (er) { toast(er.message); } };
    $('#cp').onsubmit = async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); try { await api(`/admin/pages/${f.slug}/${f.lang}`, { method: 'PUT', body: { title: f.title, body: f.body } }); toast(t('saved')); route(); } catch (er) { toast(er.message); } };
  } else if (tab === 'users') {
    const us = await api('/admin/users');
    shell(`<table><tr><th>#</th><th>${t('email')}</th><th>${t('fullName')}</th><th>Role</th><th>Agency</th><th>Hotel</th></tr>${us.map((u) => `<tr><td>${u.id}</td><td>${esc(u.email)}</td><td>${esc(u.name)}</td><td><span class="tag">${esc(u.role)}</span></td><td>${u.agencyId || ''}</td><td>${u.hotelId || ''}</td></tr>`).join('')}</table>`);
  } else {
    const lg = await api('/admin/audit');
    shell(`<table><tr><th>${'Time'}</th><th>User</th><th>Action</th><th>Detail</th></tr>${lg.map((l) => `<tr><td>${esc(l.at)}</td><td>${esc(l.email || '—')}</td><td>${esc(l.action)}</td><td class="small muted">${esc(l.detail)}</td></tr>`).join('')}</table>`);
  }
});

R(/^\/page\/([a-z0-9-]+)$/, async (app, m) => {
  const p = await api(`/pages/${m[1]}?lang=${S.lang}`);
  app.innerHTML = `<div class="wrap sec"><div class="card pad"><h1>${esc(p.title)}</h1><div class="prose">${md(p.body)}</div>${m[1] === 'about' ? `<p style="margin-top:24px"><a class="btn gold" href="#/search">${t('search')}</a> <a class="btn ghost" href="#/register?type=agency">${t('registerAgency')}</a></p>` : ''}</div></div>`;
});

R(/^\/contact$/, async (app) => {
  const c = { ...CONTACT_DEF, ...((S.meta && S.meta.contact) || {}) };
  app.innerHTML = `<div class="wrap sec"><div class="card pad" style="max-width:760px;margin:0 auto"><h1>${t('contactTitle')}</h1><p class="muted">${t('contactIntro')}</p>${contactButtons(false)}
  <p style="margin-top:22px"><b>${t('phone')}:</b> <a href="tel:${esc(String(c.phone).replace(/[^+\d]/g, ''))}">${esc(c.phone)}</a>${c.email ? `<br><b>${t('email')}:</b> <a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}</p>
  <p class="muted small">${t('contactHours')}</p></div></div>`;
});

R(/^\/security$/, async (app) => {
  if (!S.user) { location.hash = '#/login'; return; }
  await loadUser();
  const draw = (setup) => {
    app.innerHTML = `<div class="wrap"><div class="auth card pad"><h2>🔒 ${t('security')}</h2><p>${t('mfa')}: ${S.user.mfa ? '<span class="tag green">ON</span>' : '<span class="tag red">OFF</span>'}</p>
    ${S.user.mfa ? `<form id="mf"><div class="field"><label>${t('mfaCode')}</label><input name="code" inputmode="numeric" maxlength="6" required></div><div id="err"></div><button class="btn danger">${t('mfaDisable')}</button></form>`
    : setup ? `<p class="small">${t('mfaHelp')}</p><p><b style="word-break:break-all">${esc(setup.secret)}</b></p><p class="small muted" style="word-break:break-all">${esc(setup.uri)}</p><form id="mf"><div class="field"><label>${t('mfaCode')}</label><input name="code" inputmode="numeric" maxlength="6" required></div><div id="err"></div><button class="btn">${t('mfaEnable')}</button></form>`
    : `<button class="btn" id="st">${t('mfaSetup')}</button>`}</div></div>`;
    if ($('#st')) $('#st').onclick = async () => draw(await api('/auth/mfa/setup', { method: 'POST' }));
    if ($('#mf')) $('#mf').onsubmit = async (e) => {
      e.preventDefault();
      try { await api(S.user.mfa ? '/auth/mfa/disable' : '/auth/mfa/enable', { method: 'POST', body: { code: e.target.code.value } }); await loadUser(); toast(t('saved')); draw(); }
      catch (er) { $('#err').innerHTML = `<div class="err">${esc(er.message)}</div>`; }
    };
  };
  draw();
});

R(/^\/forgot$/, async (app) => {
  app.innerHTML = `<div class="wrap"><div class="auth card pad"><h2>${t('forgot')}</h2><p class="muted small">${t('forgotHelp')}</p><form id="ff"><div class="field"><label>${t('email')}</label><input type="email" name="email" required autocomplete="username"></div><div id="err"></div><button class="btn" style="width:100%">${t('sendLink')}</button></form><p class="small"><a href="#/login">← ${t('login')}</a></p></div></div>`;
  $('#ff').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/auth/forgot', { method: 'POST', body: { email: e.target.email.value }, quiet: true }); $('#ff').innerHTML = `<div class="notice">${t('resetSent')}</div>`; }
    catch (er) { $('#err').innerHTML = `<div class="err">${esc(er.message)}</div>`; }
  };
});
R(/^\/reset$/, async (app, m, q) => {
  app.innerHTML = `<div class="wrap"><div class="auth card pad"><h2>${t('newPassword')}</h2><form id="rf2"><div class="field"><label>${t('password')} (8+)</label><input type="password" name="password" minlength="8" required autocomplete="new-password"></div><div class="field"><label>${t('repeatPassword')}</label><input type="password" name="again" minlength="8" required autocomplete="new-password"></div><div id="err"></div><button class="btn" style="width:100%">${t('save')}</button></form></div></div>`;
  enhancePasswords();
  $('#rf2').onsubmit = async (e) => {
    e.preventDefault();
    if (e.target.password.value !== e.target.again.value) { $('#err').innerHTML = `<div class="err">${t('mismatch')}</div>`; return; }
    try { await api('/auth/reset', { method: 'POST', body: { token: q.token, password: e.target.password.value }, quiet: true }); toast(t('saved')); location.hash = '#/login'; }
    catch (er) { $('#err').innerHTML = `<div class="err">${esc(er.message)}</div>`; }
  };
});

/* show/hide (eye) button on every password field */
function enhancePasswords() {
  document.querySelectorAll('input[type=password]:not([data-eye])').forEach((inp) => {
    inp.dataset.eye = '1';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative';
    inp.parentNode.insertBefore(wrap, inp);
    wrap.appendChild(inp);
    inp.style.paddingRight = '44px';
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = '👁'; b.title = t('showPassword'); b.setAttribute('aria-label', t('showPassword'));
    b.style.cssText = 'position:absolute;right:6px;top:50%;transform:translateY(-50%);border:0;background:none;cursor:pointer;font-size:18px;padding:4px 8px;opacity:.7';
    b.onclick = () => { const show = inp.type === 'password'; inp.type = show ? 'text' : 'password'; b.textContent = show ? '🙈' : '👁'; b.style.opacity = show ? 1 : .7; };
    wrap.appendChild(b);
  });
}
new MutationObserver(() => enhancePasswords()).observe(document.getElementById('app'), { childList: true, subtree: true });

/* ---------- boot ---------- */
(async () => {
  document.documentElement.lang = S.lang;
  S.meta = await api('/meta');
  await loadUser();
  renderTop();
  route();
})();

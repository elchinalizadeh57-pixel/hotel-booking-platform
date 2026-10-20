// Supplier / PMS / Channel Manager adapters.
// Adapter contract (see docs/SUPPLIER_API.md):
//   fetchCatalog()                      -> [{externalId,name,country,city,address,stars,description,images,amenities,meal,priceModel,rooms:[{externalId,name,maxGuests,bed,area,basePrice,count}]}]
//   fetchAvailability(roomExtId,from,to)-> [{date,available,price}]   (optional)
//   book({roomExternalId,checkIn,checkOut,rooms,guest,ref}) -> {externalRef}   (throws if not confirmed)
//   cancel(externalRef)
const env = (k) => process.env[k] || '';
const J = JSON.stringify;

const mockAdapter = {
  autoApprove: true,
  async fetchCatalog() {
    return [
      { externalId: 'IST-1', name: 'Bosphorus Terrace Hotel', country: 'Turkey', city: 'Istanbul', address: 'Ortakoy 8', stars: 5, description: 'Supplier demo: waterfront hotel with Bosphorus views.', images: ['https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=70'], amenities: ['wifi', 'spa', 'restaurant'], meal: 'BB', priceModel: 'netto', rooms: [{ externalId: 'IST-1-A', name: 'Classic Room', maxGuests: 2, bed: '1 double bed', area: 24, basePrice: 90, count: 6 }, { externalId: 'IST-1-B', name: 'Bosphorus Suite', maxGuests: 3, bed: '1 king bed', area: 45, basePrice: 190, count: 2 }] },
      { externalId: 'IST-2', name: 'Grand Bazaar Inn', country: 'Turkey', city: 'Istanbul', address: 'Beyazit 3', stars: 3, description: 'Supplier demo: budget-friendly inn next to the Grand Bazaar.', images: ['https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=1200&q=70'], amenities: ['wifi', 'ac'], meal: 'RO', priceModel: 'brutto', rooms: [{ externalId: 'IST-2-A', name: 'Standard Twin', maxGuests: 2, bed: '2 single beds', area: 18, basePrice: 45, count: 8 }] },
    ];
  },
  async book({ guest, ref }) {
    if (/FAIL/i.test(guest?.name || '')) throw new Error('Supplier rejected the booking');
    return { externalRef: 'MOCK-' + ref };
  },
  async cancel() { return true; },
};

// Generic REST supplier: SUPPLIER_REST_URL + SUPPLIER_REST_KEY (Bearer)
const restAdapter = {
  autoApprove: false,
  async call(path, opt = {}) {
    const r = await fetch(env('SUPPLIER_REST_URL') + path, { ...opt, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env('SUPPLIER_REST_KEY') } });
    if (!r.ok) throw new Error(`Supplier ${path} -> ${r.status}`);
    return r.json();
  },
  fetchCatalog() { return this.call('/catalog'); },
  fetchAvailability(id, from, to) { return this.call(`/rooms/${encodeURIComponent(id)}/availability?from=${from}&to=${to}`); },
  async book(b) { const j = await this.call('/bookings', { method: 'POST', body: J(b) }); if (!j.externalRef) throw new Error('Supplier did not confirm'); return j; },
  async cancel(ref) { await this.call('/bookings/' + encodeURIComponent(ref), { method: 'DELETE' }); return true; },
};

const ADAPTERS = { mock: mockAdapter, rest: restAdapter };

function createSuppliers(db) {
  const get = (s, ...p) => db.prepare(s).get(...p);
  const run = (s, ...p) => db.prepare(s).run(...p);
  const adapterOf = (sup) => ADAPTERS[sup.adapter];

  function ensureDefaults() {
    if (!get("SELECT 1 FROM suppliers WHERE code='mock'")) run("INSERT INTO suppliers(code,name,adapter) VALUES('mock','Demo Supplier (mock API)','mock')");
    if (env('SUPPLIER_REST_URL') && !get("SELECT 1 FROM suppliers WHERE code='rest'")) run("INSERT INTO suppliers(code,name,adapter) VALUES('rest','REST Supplier','rest')");
  }

  async function sync(sup) {
    const ad = adapterOf(sup);
    try {
      const catalog = await ad.fetchCatalog();
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const h of catalog) {
          let m = get("SELECT local_id FROM supplier_mappings WHERE supplier_id=? AND kind='hotel' AND external_id=?", sup.id, h.externalId);
          let hid = m?.local_id;
          if (!hid) {
            const dup = get('SELECT id,supplier_id FROM hotels WHERE lower(name)=lower(?) AND lower(city)=lower(?)', h.name, h.city);
            if (dup && !dup.supplier_id) { // duplicate of a direct hotel: link only, never overwrite direct inventory
              run("INSERT INTO supplier_mappings VALUES(?,?,'hotel',?)", sup.id, h.externalId, dup.id);
              continue;
            }
            hid = Number(run(`INSERT INTO hotels(name,country,city,address,stars,description,images,amenities,meal,price_model,source,status,supplier_id,external_id)
              VALUES(?,?,?,?,?,?,?,?,?,?,'supplier',?,?,?)`, h.name, h.country, h.city, h.address, h.stars, h.description, J(h.images || []), J(h.amenities || []), h.meal || 'RO', h.priceModel || 'netto', ad.autoApprove ? 'approved' : 'hidden', sup.id, h.externalId).lastInsertRowid);
            run("INSERT INTO supplier_mappings VALUES(?,?,'hotel',?)", sup.id, h.externalId, hid);
          } else if (!get('SELECT supplier_id FROM hotels WHERE id=?', hid)?.supplier_id) continue;
          for (const r of h.rooms || []) {
            const rm = get("SELECT local_id FROM supplier_mappings WHERE supplier_id=? AND kind='room' AND external_id=?", sup.id, r.externalId);
            if (rm) run('UPDATE room_types SET name=?, max_guests=?, bed=?, area=?, base_price=?, count=? WHERE id=?', r.name, r.maxGuests, r.bed, r.area, r.basePrice, r.count, rm.local_id);
            else {
              const rid = Number(run('INSERT INTO room_types(hotel_id,name,max_guests,bed,area,base_price,count,external_id,amenities) VALUES(?,?,?,?,?,?,?,?,?)', hid, r.name, r.maxGuests, r.bed, r.area, r.basePrice, r.count, r.externalId, J(['wifi', 'tv'])).lastInsertRowid);
              run("INSERT INTO supplier_mappings VALUES(?,?,'room',?)", sup.id, r.externalId, rid);
            }
          }
        }
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
      // optional live availability for the next 60 days (supplier is the source of truth for its rooms)
      if (ad.fetchAvailability) {
        const from = new Date().toISOString().slice(0, 10), to = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);
        for (const m of db.prepare("SELECT external_id,local_id FROM supplier_mappings WHERE supplier_id=? AND kind='room'").all(sup.id)) {
          for (const d of await ad.fetchAvailability(m.external_id, from, to)) {
            run(`INSERT INTO inventory(room_type_id,date,available,price) VALUES(?,?,?,?) ON CONFLICT(room_type_id,date) DO UPDATE SET available=excluded.available, price=excluded.price`, m.local_id, d.date, d.available, d.price ?? null);
          }
        }
      }
      run("UPDATE suppliers SET last_sync=?, last_status='ok', last_error=NULL WHERE id=?", new Date().toISOString(), sup.id);
      return { ok: true };
    } catch (e) {
      run("UPDATE suppliers SET last_sync=?, last_status='error', last_error=? WHERE id=?", new Date().toISOString(), String(e.message).slice(0, 300), sup.id);
      return { ok: false, error: e.message };
    }
  }
  const syncAll = async () => { for (const s of db.prepare('SELECT * FROM suppliers WHERE active=1').all()) await sync(s); };

  async function book(hotel, room, b, guest) {
    const sup = get('SELECT * FROM suppliers WHERE id=?', hotel.supplier_id);
    return adapterOf(sup).book({ roomExternalId: room.external_id, checkIn: b.check_in, checkOut: b.check_out, rooms: b.rooms, guest, ref: b.ref });
  }
  async function cancel(hotelId, externalRef) {
    const h = get('SELECT supplier_id FROM hotels WHERE id=?', hotelId);
    await adapterOf(get('SELECT * FROM suppliers WHERE id=?', h.supplier_id)).cancel(externalRef);
  }
  return { ensureDefaults, sync, syncAll, book, cancel };
}

module.exports = { createSuppliers, ADAPTERS };

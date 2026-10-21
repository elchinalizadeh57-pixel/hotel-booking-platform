const { hashPassword } = require('./auth');

const U = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=70`;
const IMG = {
  pool: U('photo-1566073771259-6a8506099945'), lobby: U('photo-1551882547-ff40c63fe5fa'),
  room1: U('photo-1520250497591-112f2f40a3f4'), room2: U('photo-1582719508461-905c673771fd'),
  resort: U('photo-1571896349842-33c89424de2d'), suite: U('photo-1564501049412-61c2a3083791'),
  view: U('photo-1445019980597-93fa8acb246c'), bed: U('photo-1542314831-068cd1dbfeeb'),
  bed2: U('photo-1578683010236-d716f9a3f461'),
};
const imgs = (...k) => JSON.stringify(k.map((x) => IMG[x]));

const HOTELS = [
  ['Caspian Pearl Hotel', 'Azerbaijan', 'Baku', 'Neftchilar Ave 12', 40.3716, 49.8436, 5, 'Sea-front luxury hotel with a rooftop pool and panoramic Caspian views.', ['wifi', 'pool', 'spa', 'parking', 'restaurant', 'gym'], 'BB', 'netto', 9.2, ['pool', 'lobby', 'room1']],
  ['Old City Boutique', 'Azerbaijan', 'Baku', 'Icherisheher, Asaf Zeynalli 5', 40.3667, 49.8352, 4, 'Charming boutique hotel inside the UNESCO-listed walled Old City.', ['wifi', 'restaurant', 'ac'], 'BB', 'netto', 8.9, ['lobby', 'bed', 'room2']],
  ['Flame View Suites', 'Azerbaijan', 'Baku', 'Mehdi Huseyn 40', 40.3892, 49.8472, 4, 'Modern apartments-style suites facing the Flame Towers.', ['wifi', 'gym', 'parking', 'ac'], 'RO', 'brutto', 8.6, ['view', 'suite', 'bed2']],
  ['Mountain Breeze Resort', 'Azerbaijan', 'Gabala', 'Nohur Lake road 3', 41.0, 47.8, 5, 'Forest resort with spa, pool and mountain trails right outside.', ['wifi', 'pool', 'spa', 'parking', 'restaurant'], 'HB', 'netto', 9.0, ['resort', 'pool', 'room1']],
  ['Caravanserai Inn', 'Azerbaijan', 'Sheki', 'Kichik Bazar 9', 41.1975, 47.1706, 3, 'Historic inn near the Khan Palace with a quiet courtyard.', ['wifi', 'restaurant', 'parking'], 'BB', 'brutto', 8.4, ['lobby', 'bed2', 'room2']],
  ['Silk Road Palace', 'Uzbekistan', 'Tashkent', 'Amir Temur 15', 41.3111, 69.2797, 5, 'Grand city-centre hotel with conference halls and a fine dining restaurant.', ['wifi', 'pool', 'spa', 'gym', 'parking', 'restaurant', 'ac'], 'BB', 'netto', 9.1, ['lobby', 'pool', 'suite']],
  ['Registan Heritage Hotel', 'Uzbekistan', 'Samarkand', 'Registan St 21', 39.6542, 66.9597, 4, 'Walking distance to Registan Square, decorated in traditional style.', ['wifi', 'restaurant', 'ac', 'parking'], 'BB', 'netto', 8.8, ['view', 'room1', 'bed']],
  ['Lyabi Courtyard', 'Uzbekistan', 'Bukhara', 'Lyabi Hauz 2', 39.7747, 64.4286, 3, 'Family-run courtyard guesthouse beside the Lyabi-Hauz pond.', ['wifi', 'restaurant', 'ac'], 'BB', 'brutto', 8.7, ['lobby', 'bed2', 'room2']],
  ['Tashkent City Garden', 'Uzbekistan', 'Tashkent', 'Shota Rustaveli 30', 41.2995, 69.2401, 4, 'Quiet business hotel with a garden terrace near the metro.', ['wifi', 'gym', 'parking', 'restaurant', 'ac'], 'RO', 'netto', 8.3, ['resort', 'room1', 'bed']],
  ['Khiva Fortress Hotel', 'Uzbekistan', 'Khiva', 'Pahlavon Mahmud 7', 41.3783, 60.3598, 3, 'Stay inside the walls of Ichan-Qala in a restored madrasa.', ['wifi', 'restaurant'], 'BB', 'netto', 8.5, ['view', 'lobby', 'bed2']],
];
const ROOMS = [['Standard Double', 2, '1 double bed', 22, 1], ['Deluxe Room', 3, '1 king bed', 30, 1.45], ['Family Suite', 4, '2 queen beds', 48, 2.1]];

// Demo accounts (known passwords) are created only outside production, or when SEED_DEMO_USERS=1.
// In production the single admin gets ADMIN_EMAIL / ADMIN_PASSWORD from the environment.
function seed(db) {
  const demo = process.env.SEED_DEMO_USERS === '1' || process.env.NODE_ENV !== 'production';
  const insU = db.prepare('INSERT INTO users(email,name,pass,role,agency_id,hotel_id) VALUES(?,?,?,?,?,?)');
  const insH = db.prepare(`INSERT INTO hotels(name,country,city,address,lat,lng,stars,description,amenities,meal,price_model,rating,images,
    website,instagram) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insR = db.prepare('INSERT INTO room_types(hotel_id,name,max_guests,bed,area,amenities,image,base_price,count) VALUES(?,?,?,?,?,?,?,?,?)');
  HOTELS.forEach((h, i) => {
    const id = Number(insH.run(h[0], h[1], h[2], h[3], h[5] ? h[4] : null, h[5], h[6], h[7], JSON.stringify(h[8]), h[9], h[10], h[11],
      imgs(...h[12]), 'https://example.com', 'https://instagram.com/').lastInsertRowid);
    const base = h[6] * 22 + 15 + (i % 3) * 6;
    ROOMS.forEach((r, j) => insR.run(id, r[0], r[1], r[2], r[3], JSON.stringify(['wifi', 'tv', 'ac']), IMG[['room1', 'bed', 'suite'][j]], Math.round(base * r[4]), 4 + j));
  });
  db.exec("UPDATE hotels SET payment_policy='online' WHERE id=3; UPDATE hotels SET payment_policy='property' WHERE id=5");
  if (demo) {
    const ag = Number(db.prepare("INSERT INTO agencies(name,voen,country,contact,status,credit_limit) VALUES('Silk Tours LLC','1234567890','Azerbaijan','+994 50 000 00 00','approved',5000)").run().lastInsertRowid);
    const ag2 = Number(db.prepare("INSERT INTO agencies(name,voen,country,contact,status) VALUES('New Horizons Travel','9876543210','Uzbekistan','+998 90 000 00 00','pending')").run().lastInsertRowid);
    insU.run('admin@hotel.local', 'Platform Admin', hashPassword('Admin123!'), 'admin', null, null);
    insU.run('tourist@hotel.local', 'Demo Tourist', hashPassword('Tourist123!'), 'tourist', null, null);
    insU.run('agency@hotel.local', 'Silk Tours Manager', hashPassword('Agency123!'), 'agency', ag, null);
    insU.run('agency2@hotel.local', 'New Horizons Manager', hashPassword('Agency123!'), 'agency', ag2, null);
    insU.run('hotel@hotel.local', 'Caspian Pearl Manager', hashPassword('Hotel123!'), 'hotel', null, 1);
  } else {
    const email = (process.env.ADMIN_EMAIL || '').toLowerCase();
    let pass = process.env.ADMIN_PASSWORD;
    if (!email) throw new Error('ADMIN_EMAIL must be set in production');
    if (!pass) { pass = require('crypto').randomBytes(12).toString('base64url'); console.log('[seed] generated admin password for ' + email + ': ' + pass); }
    if (pass.length < 10) throw new Error('ADMIN_PASSWORD must be at least 10 characters');
    insU.run(email, 'Administrator', hashPassword(pass), 'admin', null, null);
  }
  const rule = db.prepare('INSERT INTO pricing_rules(kind,scope,scope_ref,percent) VALUES(?,?,?,?)');
  rule.run('markup', 'platform', null, 20);
  rule.run('markup', 'country', 'Uzbekistan', 25);
  rule.run('agency_discount', 'platform', null, 15);
  rule.run('commission', 'platform', null, 12);
}

module.exports = { seed };

// Transactional outbox: events are stored in the same database as the booking, then delivered with
// retry/backoff. A failed delivery never affects the booking itself (Telegram etc. are notifications only).
const C = require('./channels');
const MAX_ATTEMPTS = 5;

function createOutbox(db) {
  const ins = db.prepare('INSERT OR IGNORE INTO outbox(channel,dedupe,payload,next_at) VALUES(?,?,?,?)');
  const now = () => new Date().toISOString();

  function enqueue(channel, dedupe, payload) {
    if (!C[channel].configured()) return false;
    ins.run(channel, dedupe, JSON.stringify(payload), now());
    return true;
  }

  /** Fan an event out to the channels that care about it. `b` is a safe booking summary (no NETTO data). */
  function emit(event, b) {
    const key = (ch) => `${ch}:${event}:${b.ref}`;
    const label = { 'booking.confirmed': 'Confirmed', 'booking.cancelled': 'Cancelled', 'booking.created': 'New', 'payment.failed': 'Payment failed' }[event] || event;
    enqueue('telegram', key('telegram'), { text: `${label} booking ${b.ref}\n${b.hotel} | ${b.checkIn} -> ${b.checkOut}\n${b.total} ${b.currency} | ${b.channel}` });
    enqueue('crm', key('crm'), { event, booking: b, contact: b.contact });
    if (event === 'booking.confirmed' || event === 'booking.cancelled') {
      enqueue('sheets', key('sheets'), { row: [b.ref, event.split('.')[1], b.hotel, b.checkIn, b.checkOut, b.nights, b.total, b.currency, b.channel] });
      if (b.contact?.email) enqueue('email', key('email'), { to: b.contact.email, subject: `Booking ${b.ref} ${event.split('.')[1]}`, text: `${b.hotel}\n${b.checkIn} -> ${b.checkOut}\nTotal: ${b.total} ${b.currency}\nReference: ${b.ref}` });
    }
  }

  async function process() {
    const rows = db.prepare("SELECT * FROM outbox WHERE status IN ('pending','retry') AND next_at <= ? ORDER BY id LIMIT 20").all(now());
    for (const r of rows) {
      try {
        await C[r.channel].send(JSON.parse(r.payload));
        db.prepare("UPDATE outbox SET status='done', done_at=?, error=NULL, attempts=attempts+1 WHERE id=?").run(now(), r.id);
      } catch (e) {
        const attempts = r.attempts + 1;
        const status = attempts >= MAX_ATTEMPTS ? 'failed' : 'retry';
        const next = new Date(Date.now() + 2 ** attempts * 15000).toISOString();
        db.prepare('UPDATE outbox SET status=?, attempts=?, next_at=?, error=? WHERE id=?').run(status, attempts, next, String(e.message).slice(0, 300), r.id);
      }
    }
    return rows.length;
  }
  const status = () => ({
    channels: Object.fromEntries(Object.keys(C).map((k) => [k, C[k].configured()])),
    counts: db.prepare('SELECT channel,status,COUNT(*) n FROM outbox GROUP BY channel,status').all(),
    recent: db.prepare('SELECT id,channel,status,attempts,error,created_at FROM outbox ORDER BY id DESC LIMIT 30').all(),
  });
  const retry = (id) => db.prepare("UPDATE outbox SET status='pending', attempts=0, next_at=? WHERE id=? AND status='failed'").run(now(), id);
  return { enqueue, emit, process, status, retry };
}
module.exports = { createOutbox };

// Payment providers. `mock` is a built-in demo gateway; `stripe` uses Stripe Checkout over REST
// (hosted page: card data never touches this server). Select with PAYMENT_PROVIDER=stripe.
const crypto = require('crypto');
const env = (k) => process.env[k] || '';

const provider = () => (env('PAYMENT_PROVIDER') === 'stripe' && env('STRIPE_SECRET_KEY') ? 'stripe' : 'mock');

async function createStripeCheckout({ booking, successUrl, cancelUrl }) {
  const p = new URLSearchParams({
    mode: 'payment', success_url: successUrl, cancel_url: cancelUrl, client_reference_id: booking.ref,
    'metadata[booking_id]': String(booking.id), 'metadata[ref]': booking.ref, customer_email: booking.guest_email,
    'line_items[0][quantity]': '1', 'line_items[0][price_data][currency]': booking.currency.toLowerCase(),
    'line_items[0][price_data][unit_amount]': String(Math.round(booking.total_cur * 100)),
    'line_items[0][price_data][product_data][name]': `Booking ${booking.ref}`,
  });
  const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST', body: p,
    headers: { authorization: 'Bearer ' + env('STRIPE_SECRET_KEY'), 'content-type': 'application/x-www-form-urlencoded', 'idempotency-key': `bk-${booking.id}-${booking.total_cur}` },
  });
  const j = await r.json();
  if (!r.ok) throw Object.assign(new Error(j.error?.message || 'Payment provider error'), { status: 502 });
  return { id: j.id, url: j.url };
}

/** Stripe-Signature: t=<ts>,v1=<hmac_sha256(secret, `${t}.${raw}`)> */
function verifyStripeSignature(raw, header, secret, now = Date.now()) {
  const parts = Object.fromEntries(String(header || '').split(',').map((x) => x.split('=')));
  if (!parts.t || !parts.v1 || !secret) return false;
  if (Math.abs(now / 1000 - Number(parts.t)) > 300) return false;
  const exp = crypto.createHmac('sha256', secret).update(`${parts.t}.${raw}`).digest('hex');
  const a = Buffer.from(exp), b = Buffer.from(parts.v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { provider, createStripeCheckout, verifyStripeSignature };

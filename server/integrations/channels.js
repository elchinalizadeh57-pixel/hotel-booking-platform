// Outbound channels. Each is enabled only when its environment variables are set; all use global fetch
// so they can be stubbed in tests. Secrets come from the environment only.
const crypto = require('crypto');

const env = (k) => process.env[k] || '';
const b64u = (b) => Buffer.from(b).toString('base64url');

const telegram = {
  configured: () => !!(env('TELEGRAM_BOT_TOKEN') && env('TELEGRAM_CHAT_ID')),
  async send({ text }) {
    const r = await fetch(`https://api.telegram.org/bot${env('TELEGRAM_BOT_TOKEN')}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: env('TELEGRAM_CHAT_ID'), text, disable_web_page_preview: true }),
    });
    if (!r.ok) throw new Error(`Telegram ${r.status}`);
  },
};

const crm = {
  configured: () => !!env('CRM_WEBHOOK_URL'),
  async send(payload) {
    const body = JSON.stringify(payload);
    const sig = crypto.createHmac('sha256', env('CRM_WEBHOOK_SECRET')).update(body).digest('hex');
    const r = await fetch(env('CRM_WEBHOOK_URL'), { method: 'POST', headers: { 'content-type': 'application/json', 'x-signature': sig }, body });
    if (!r.ok) throw new Error(`CRM ${r.status}`);
  },
};

let gToken = { v: null, exp: 0 };
async function googleToken() {
  if (gToken.v && gToken.exp > Date.now() + 60000) return gToken.v;
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64u(JSON.stringify({ iss: env('GOOGLE_SA_EMAIL'), scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const sig = crypto.createSign('RSA-SHA256').update(`${head}.${claim}`).sign(env('GOOGLE_SA_KEY').replace(/\\n/g, '\n')).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${sig}` }) });
  if (!r.ok) throw new Error(`Google auth ${r.status}`);
  const j = await r.json();
  gToken = { v: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return gToken.v;
}
const sheets = {
  configured: () => !!(env('GOOGLE_SA_EMAIL') && env('GOOGLE_SA_KEY') && env('SHEETS_ID')),
  async send({ row }) {
    const range = encodeURIComponent(env('SHEETS_RANGE') || 'Bookings!A:I');
    const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${env('SHEETS_ID')}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + (await googleToken()) }, body: JSON.stringify({ values: [row] }),
    });
    if (!r.ok) throw new Error(`Sheets ${r.status}`);
  },
};

let transport;
const email = {
  configured: () => !!env('SMTP_URL'),
  async send({ to, subject, text }) {
    transport ||= require('nodemailer').createTransport(env('SMTP_URL'));
    await transport.sendMail({ from: env('MAIL_FROM') || 'Stayly <no-reply@stayly.local>', to, subject, text });
  },
};

module.exports = { telegram, crm, sheets, email };

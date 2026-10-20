// RFC 6238 TOTP (SHA-1, 6 digits, 30 s) without external dependencies.
const crypto = require('crypto');
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function newSecret() {
  let bits = '', out = '';
  for (const x of crypto.randomBytes(20)) bits += x.toString(2).padStart(8, '0');
  for (let i = 0; i < bits.length; i += 5) out += ALPHA[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}
function decode(s) {
  let bits = '';
  for (const c of s.replace(/=+$/, '').toUpperCase()) bits += ALPHA.indexOf(c).toString(2).padStart(5, '0');
  const out = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}
function code(secret, t = Date.now()) {
  const ctr = Buffer.alloc(8);
  ctr.writeBigUInt64BE(BigInt(Math.floor(t / 30000)));
  const h = crypto.createHmac('sha1', decode(secret)).update(ctr).digest();
  const o = h[19] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}
const verify = (secret, c, t = Date.now()) => [-1, 0, 1].some((d) => code(secret, t + d * 30000) === String(c).trim());
const uri = (secret, email) => `otpauth://totp/Stayly:${encodeURIComponent(email)}?secret=${secret}&issuer=Stayly`;

module.exports = { newSecret, code, verify, uri };

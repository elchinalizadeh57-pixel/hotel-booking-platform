# Stayly — Hotel Booking Platform

B2C + B2B hotel booking platform (Booking.com / Ostrovok style) built from the *Hotel Booking Platform* technical specification.
Markets: Azerbaijan & Uzbekistan · Languages: AZ / RU / UZ / EN · Currencies: USD / AZN / UZS.

## Run

Requires **Node.js ≥ 22.5** (uses the built-in `node:sqlite`).

```bash
npm install
npm start          # http://localhost:3000
npm test           # 17 tests: pricing engine, roles, double-booking, payments, idempotency
```

The SQLite database (`data/hotel.db`) is created and seeded with demo data on first start. Env: `PORT`, `DB_PATH`, `AUTH_SECRET`.

## Demo accounts (seed data only)

| Role | Email | Password |
|---|---|---|
| Admin | admin@hotel.local | Admin123! |
| Tourist | tourist@hotel.local | Tourist123! |
| Agency (approved) | agency@hotel.local | Agency123! |
| Agency (pending) | agency2@hotel.local | Agency123! |
| Hotel manager | hotel@hotel.local | Hotel123! |

## Implemented (spec sections)

- **Roles & auth (§3, §18):** tourist / agency / hotel / admin, scrypt password hashing, signed tokens, server-side RBAC, login rate limiting. Agencies stay `pending` until approved by admin; hotel owners submit a claim (existing or new hotel) that admin reviews.
- **Pricing engine (§7):** NETTO → `BRUTTO = NETTO × (1+markup%)`; BRUTTO → `AGENCY = BRUTTO × (1−discount%)`; rules by platform / country / hotel / room / agency with date ranges, specificity priority, conflict rejection, rounding, per-booking immutable price snapshot (hotel payable, platform revenue). All calculation is server-side; tourist API responses never contain NETTO/agency data.
- **Inventory (§5):** per-date availability/price/closed, atomic hold inside an immediate SQLite transaction (no double booking — tested with parallel requests), 15-min hold with automatic release, idempotency keys, optional physical room numbers.
- **Booking & payments (§6, §8):** statuses with transition rules and history, demo card gateway (card data never stored; a card ending `0000` is declined), full/partial refund by cancellation policy, agency contract settlement with credit limit and debt.
- **Hotel cabinet (§10)**, **Admin (§11):** dashboard & funnel, bookings, hotels, claims, agencies/credit limits, pricing rules, users, audit log.
- **i18n & currency (§15), responsive UI (§19), in-app notifications (§13).**

## Not implemented (needs external contracts/decisions — spec §12, §21 phases 4–5)

Real payment provider, external supplier/PMS/Channel Manager adapters, CRM, Telegram, Google Sheets, e-mail delivery, MFA, SEO/CMS. Exchange rates are fixed in `server/pricing.js`. See "decisions to confirm" at the end of the specification (taxes, commission order, refund policy…).

## Structure

```
server/  app.js (API) · pricing.js (engine) · db.js (schema) · seed.js · auth.js
public/  SPA (index.html, app.js, i18n.js, style.css)
tests/   node:test suites
```

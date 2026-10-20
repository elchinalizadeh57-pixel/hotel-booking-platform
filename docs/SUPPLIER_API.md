# Supplier / PMS REST contract

Set `SUPPLIER_REST_URL` and `SUPPLIER_REST_KEY`. Requests carry `Authorization: Bearer <key>`.
A new supplier hotel is imported as **hidden** until an admin approves it (Admin → Hotels → Show).
Hotels whose name and city match an existing direct hotel are linked, never overwritten.

| Method | Path | Response |
|---|---|---|
| GET | `/catalog` | `[{externalId,name,country,city,address,stars,description,images[],amenities[],meal,priceModel:"netto"\|"brutto",rooms:[{externalId,name,maxGuests,bed,area,basePrice,count}]}]` |
| GET | `/rooms/{externalId}/availability?from=YYYY-MM-DD&to=YYYY-MM-DD` | `[{date,available,price}]` (optional; the supplier is the source of truth for its rooms) |
| POST | `/bookings` | body `{roomExternalId,checkIn,checkOut,rooms,guest:{name,email,phone},ref}` → `{externalRef}`. A booking is shown as *confirmed* only after this succeeds; on error the inventory/debt is released and online payments are refunded. |
| DELETE | `/bookings/{externalRef}` | cancels at the supplier; local cancellation happens only if this succeeds |

Sync runs every `SUPPLIER_SYNC_MIN` minutes and on demand from Admin → Integrations. Errors are shown there with the last error message.
A built-in `mock` supplier (Istanbul hotels) demonstrates the flow; a guest name containing `FAIL` makes it reject a booking.

## Other integrations

* **Stripe**: `PAYMENT_PROVIDER=stripe`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. Webhook endpoint: `POST /api/webhooks/stripe` (event `checkout.session.completed`). Signature verified, events de-duplicated.
* **Telegram / CRM / Google Sheets / e-mail**: queued in a transactional outbox with retry (5 attempts, exponential backoff) and an error log. Telegram and Sheets never receive guest personal data; CRM receives contact data signed with HMAC-SHA256 (`X-Signature`).

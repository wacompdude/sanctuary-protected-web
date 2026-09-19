# Sanctuary Protected — Stripe Setup

**Status:** Phase 2 draft — operational setup guide (no secrets)  
**Companion:** [`BILLING_REQUIREMENTS.md`](./BILLING_REQUIREMENTS.md), [`BILLING_ARCHITECTURE.md`](./BILLING_ARCHITECTURE.md)  

This document describes how to configure Stripe for Sanctuary Protected. **Never commit secret keys, webhook signing secrets, or live credentials to git or these docs.**

Legal payee: **Unified Protective Technologies LLC**  
Customer brand: **Sanctuary Protected**

---

## 1. Environments

Maintain **separate** Stripe accounts or clearly separated sandbox vs live mode keys:

| App environment | Stripe mode | Notes |
|-----------------|-------------|-------|
| Local development | Test mode | Restricted test keys only |
| Vercel Preview | Test mode | Prefer test keys; never live |
| Production | Live mode | Live keys only in production env |

**Never** point local/preview `STRIPE_SECRET_KEY` at live mode.

---

## 2. Environment Variables

Names already reserved in `.env.example`:

```bash
BILLING_PROVIDER=stripe

# Server only — never NEXT_PUBLIC_
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Browser-safe publishable key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
```

Optional later:

```bash
# Stripe Tax / portal configuration flags if needed
# STRIPE_PORTAL_CONFIGURATION_ID=
```

### Rules

- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are **server-only**.  
- Only the publishable key may use `NEXT_PUBLIC_`.  
- Rotate keys if ever exposed.  
- Store values in Vercel project env / local `.env.local` (gitignored).

When `BILLING_PROVIDER=stripe` but the adapter/SDK is not installed, the app currently falls back to the unconfigured provider and logs a warning (`lib/billing/provider.ts`). Phase 4 installs the adapter.

---

## 3. Products & Prices (catalog mapping)

Create Stripe **Products** that mirror internal plans. Prefer stable product metadata:

| Metadata key | Value |
|--------------|-------|
| `sanctuary_plan_key` | `servant_standard` / `steward_pro` / `shepherd_plus` / `omni_enterprise` |
| `sanctuary_product_kind` | `subscription_plan` |

### Initial subscription Prices (monthly, USD)

| Plan key | Display name | Amount | Cents |
|----------|--------------|--------|-------|
| `servant_standard` | Servant Standard | $29.95 | 2995 |
| `steward_pro` | Steward Pro | $39.95 | 3995 |
| `shepherd_plus` | Shepherd Plus | $59.95 | 5995 |
| `omni_enterprise` | Omni Enterprise | $150.00 | 15000 |

**Do not hard-code Stripe Price IDs in UI components.** Store them on `billing_plan_prices.billing_provider_price_id` after Phase 4 sandbox price creation (schema exists in `100_billing_foundation.sql`).

When list prices change, create a **new** Stripe Price (and new DB price version). Do not edit the old Price’s amount for grandfathering.

### Extra items (SMS blocks — Phase 9/10)

Create Products with metadata `sanctuary_product_kind=sms_block` (or `extra_item`) and `sanctuary_extra_item_key=…`.

| Plan association | Block size | Customer price | Cents |
|------------------|------------|----------------|-------|
| Servant Standard | 50 | $5.00 | 500 |
| Steward Pro | 100 | $10.00 | 1000 |
| Shepherd Plus | 200 | $20.00 | 2000 |
| Omni Enterprise | 500 | $40.00 | 4000 |

Prefer **one-time** Prices used as invoice items / invoice line items rather than separate subscriptions for each SMS block (unless metering design changes).

---

## 4. Customer mapping

- One Stripe Customer per billable **organization**  
- Store mapping in billing profile / `billing_customers`  
- Put `organization_id` in Stripe Customer metadata for support and webhooks:

```text
metadata.organization_id = <uuid>
metadata.sanctuary_environment = development|preview|production
```

---

## 5. Checkout

### Session defaults (recommended)

- Mode: `subscription` for plan purchase  
- `line_items`: server-resolved Price ID  
- `customer` or `customer_email` as appropriate  
- `client_reference_id` or metadata: `organization_id`, `plan_key`, `billing_plan_price_id`  
- `allow_promotion_codes`: true (when discounts enabled)  
- `automatic_tax[enabled]`: true when Stripe Tax is on  
- `billing_address_collection`: `required` when Tax enabled  
- `success_url` / `cancel_url`: app routes that **do not** alone activate paid access  

### Success URL policy

Success page may show “We’re confirming your payment…” and poll subscription status. **Activation is webhook-driven.**

---

## 6. Customer Portal

Enable Portal in Stripe Dashboard for the account.

**Recommended Portal features (initial):**

| Feature | Enable? |
|---------|---------|
| Update payment method | Yes |
| View invoices / history | Yes |
| Update billing information | Yes |
| Cancel subscription | Prefer **No** initially (handle in-app) |
| Switch plans | Prefer **No** initially (handle in-app for entitlements) |

If plan switching is later enabled in Portal, webhook handlers must sync plan/price → entitlements.

Use a Portal Configuration ID env var if multiple configs are needed.

---

## 7. Stripe Tax

- Enable Stripe Tax in Dashboard for the appropriate mode (test/live).  
- Collect billing address at Checkout.  
- Do not hard-code tax percentages in app code.  
- Persist tax amounts from invoice webhooks onto local invoice/transaction mirrors.

Timing: see open decision in requirements (enable at first Checkout vs Phase 11).

---

## 8. Promotion codes

- Create Coupons / Promotion Codes in Stripe Dashboard or via Platform admin (Phase 10).  
- Allow redemption in Checkout with `allow_promotion_codes`.  
- Optional: restrict by plan via Stripe restrictions + server-side validation before session create.  
- Never trust client-only “discount applied” flags.

---

## 9. Webhooks

### Endpoint URL

Use the existing app route pattern:

```text
https://<production-host>/api/billing/webhooks/stripe
```

Local development: Stripe CLI forward to local server:

```bash
stripe listen --forward-to localhost:3000/api/billing/webhooks/stripe
```

Use the CLI-printed signing secret as `STRIPE_WEBHOOK_SECRET` in local env only.

### Events to enable (initial)

See requirements for rationale. Minimum set:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.created`
- `invoice.finalized`
- `invoice.paid`
- `invoice.payment_failed`
- `invoice.payment_action_required`
- `charge.refunded` (and/or `refund.created` / `refund.updated` as applicable)
- `customer.updated` (optional, selective sync)

Add events only when a handler exists.

### Security

- Verify `Stripe-Signature` with `STRIPE_WEBHOOK_SECRET`  
- Reject invalid signatures  
- Idempotent persistence on `provider_event_id` (`billing_events`)  
- Do not log full payloads containing sensitive payment details  

---

## 10. Idempotency keys

When creating Checkout Sessions, subscription changes, invoice items, or refunds from server code, pass Stripe Idempotency-Key headers derived from stable business keys, e.g.:

```text
checkout:{organization_id}:{billing_plan_price_id}:{yyyy-mm-dd}
sms_block:{organization_id}:{period}:{block_seq}
refund:{provider_charge_or_payment_intent}:{amount_cents}
```

---

## 11. Demo / complimentary / billing-disabled

Stripe setup cannot alone prevent bad charges. Application guards must run before any money-moving API:

- `is_demo_organization` → hard deny  
- `is_complimentary` → deny recurring/overage charges  
- `billing_enabled = false` → deny charges  

Never rely on “forgetting” to create a Customer for demos; enforce in code.

---

## 12. Email sender

Billing notifications use the existing Resend sender category **`billing`**.

`.env.example` contemplates:

```bash
# EMAIL_FROM_BILLING=billing@sanctuaryprotected.com
```

Only enable after DNS/domain verification matches the platform sender registry. Do not invent unverified From addresses.

---

## 13. Phase 4 checklist (when implementing)

- [ ] Install Stripe SDK in web app (server-only usage)  
- [ ] Implement `StripeBillingProvider` behind `getBillingProvider()`  
- [ ] Configure test-mode products/prices; write Price IDs into `billing_plan_prices`  
- [ ] Configure webhook endpoint + secret in test mode  
- [ ] Verify signature rejection test  
- [ ] End-to-end Checkout in test mode for each plan  
- [ ] Confirm entitlements update only after webhook  
- [ ] Confirm demo org cannot start Checkout  
- [ ] Document live-mode cutover separately (Phase 12)  

---

## 14. What this doc intentionally omits

- Actual secret key values  
- Webhook signing secret values  
- Account passwords  
- Live Price IDs (fill in secure ops runbooks / password manager after creation)  

---

## Document control

| Version | Date | Notes |
|---------|------|-------|
| 0.1 | 2026-09-18 | Phase 2 Stripe setup outline |

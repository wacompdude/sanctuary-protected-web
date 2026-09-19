# Sanctuary Protected — Billing Requirements

**Status:** Phase 2 draft — authoritative business requirements for billing  
**Product:** Sanctuary Protected  
**Legal entity:** Unified Protective Technologies LLC  
**Primary codebase:** `sanctuary-protected-web`  
**Future client:** Expo / React Native (`sanctuary-protected-mobile`)  

**Related docs:**

- [`BILLING_ARCHITECTURE.md`](./BILLING_ARCHITECTURE.md) — technical integration with existing systems  
- [`STRIPE_SETUP.md`](./STRIPE_SETUP.md) — Stripe environment and product setup (no secrets)

This document defines **what** billing must do. Architecture defines **how** it integrates with the existing application. Do not put API secrets, webhook secrets, or private keys in this repository or these docs.

---

## 1. Purpose

Create a secure, scalable billing foundation that supports monthly subscriptions, trials, Stripe Checkout and Customer Portal, Stripe Tax, promotion codes, SMS overage billing, generic billable add-ons, invoices and transaction history, refunds, failed-payment handling, platform and organization billing administration, complimentary and billing-disabled organizations, demo-organization charge protection, versioned pricing, feature entitlement integration, Resend billing notifications, webhook processing, auditability, and future mobile support.

Billing must not compromise multi-tenant isolation.

---

## 2. Terminology

| Internal term | Customer-facing term |
|---------------|----------------------|
| `organization` | Church (where UI already uses Church) |
| Platform Administration | Platform |
| Sanctuary Protected | Product / brand |
| Unified Protective Technologies LLC | Legal payee / Stripe account holder |

Do **not** perform a global Church → Organization rename in customer-facing UI copy.

---

## 3. Authoritative System Boundaries

### Stripe is authoritative for financial payment state

Stripe answers:

- Was payment successful?
- What subscription / invoice / refund exists?
- What amount was charged?
- What payment method is on file?

### Supabase is authoritative for application access and entitlements

Supabase answers:

- Which plan is assigned to the organization?
- Which features and limits apply?
- SMS credits / usage remaining?
- Trialing, complimentary, billing-disabled, demo?

### Hard rules

- **Never** scatter feature logic like `if stripe_price_id === "price_xyz"` or `if plan_name === "Steward Pro"`.
- Feature access must go through the existing entitlement resolver (`hasFeature` / `requireFeature` / `getFeatureLimit`).
- **Never** store full card numbers, CVV, or raw payment secrets.
- Prefer Stripe-hosted Checkout and Customer Portal for card capture.
- Bird authorizes **send eligibility** only via Supabase credits/entitlements; Bird does not bill. Stripe does not decide whether an SMS may be sent.

---

## 4. Subscription Plans

Use **exact existing** plan keys and display names from the database. Do not silently rename.

| Plan key | Display name | Initial monthly price | Cents |
|----------|--------------|----------------------|-------|
| `servant_standard` | Servant Standard | $29.95 | `2995` |
| `steward_pro` | Steward Pro | $39.95 | `3995` |
| `shepherd_plus` | Shepherd Plus | $59.95 | `5995` |
| `omni_enterprise` | Omni Enterprise | $150.00 | `15000` |

**Currency:** USD  
**Billing interval (initial):** month  

**Phase 3:** Versioned `billing_plan_prices` seeds 2995 / 3995 / 5995 / 15000 and denormalizes onto `subscription_plans.monthly_price_cents`. Stripe Price IDs remain null until Phase 4 sandbox setup.

**Money storage:** Integer minor units (cents). Never floating-point for financial amounts.

---

## 5. Price Versioning

Prices must not be overwritten in place when list prices change.

Required concepts:

- Plan (catalog)
- Price version (amount, currency, interval, effective date, retired date, active/current flag)
- Stripe Product ID / Stripe Price ID on the price version
- Grandfathering eligibility for existing subscribers

Changing Steward Pro from $39.95 → $44.95 must allow existing orgs to remain on $39.95 while new orgs receive $44.95, when business policy says so.

---

## 6. Feature Entitlements

Plans and features remain independently configurable.

```
Organization
  → Subscription
  → Plan
  → Plan Feature Entitlements
  → Feature Definitions
  → (optional) Organization entitlement overrides
```

Platform Administration must eventually assign/remove features from tiers without code changes (already partially supported via `features` / `plan_features` / platform plan UI).

Billing must **extend** `lib/subscriptions/*` — not replace it.

---

## 7. Trials

### Initial business rules

| Rule | Value |
|------|-------|
| Trial enabled | Yes |
| Trial duration | **7 days** (configurable; do not hard-code forever) |
| Card required to start trial | **No** |
| May subscribe immediately instead | **Yes** |
| Default trial plan | Default public plan (`servant_standard` today) |

**Resolved (Phase 3):** Onboarding / `ensureChurchSubscription` default trial is **7 days** (`DEFAULT_BILLING_TRIAL_DAYS` + `billing_settings.trial_days`). Existing orgs already on longer trials are not silently shortened.

### Trial path

Account → Create Church → Start trial → Use product → Choose plan → Stripe Checkout → Paid subscription

### Immediate purchase path

Account → Create Church → Choose plan → Stripe Checkout → Paid subscription

### Trial expiration

When a trial expires without payment:

- **Do not** delete the organization or its data
- Transition subscription into a restricted billing state (e.g. `expired` / `payment_required` behavior)
- Restrict features via entitlement access rules tied to subscription status

Architecture must support future configuration of trial enabled, duration, default tier, card-required-for-trial, and expiration behavior.

---

## 8. Subscription Lifecycle States

Reuse existing `organization_subscription_status` values where possible:

`trialing` | `active` | `past_due` | `grace_period` | `cancelled` | `expired` | `suspended` | `incomplete`

Additional **application concepts** (flags / profile — not collapsed into one enum):

| Concept | Meaning |
|---------|---------|
| Complimentary | Full (or plan-based) access without normal recurring charges |
| Billing disabled | Platform turned off billing; must not generate Stripe charges |
| Demo | Immutable demo flag; never production charges |

Do not collapse complimentary, billing-disabled, trial, canceled, suspended, and demo into a single boolean.

**Also distinct:** `organizations.status` (`trial | active | suspended | closed`) — keep in sync carefully; do not invent a third parallel enum without need.

---

## 9. Demo Organizations

Identify demos only by `is_demo_organization` (and related restore flags). Never by name.

Demo organizations must never accidentally generate:

- Stripe charges or invoices
- SMS overage charges
- Subscription modifications that create live payment obligations
- Billing emails that imply real payment
- Real tax transactions

Snapshot/restore must continue scrubbing live provider IDs (existing demo billing scrub patterns).

---

## 10. Complimentary Organizations

Platform may grant service without normal recurring subscription charges.

Complimentary orgs may still have:

- A plan
- Feature entitlements and limits
- SMS allowances

Prefer **application-level** complimentary status integrated with entitlement and charge-guard logic. Do not rely solely on a $0 Stripe subscription unless a later reporting need requires it.

---

## 11. Billing Enabled / Disabled

Platform may enable/disable billing per organization (`billing_enabled` or equivalent on billing profile).

Billing-disabled orgs must not generate Stripe charges. This is distinct from complimentary, trial, canceled, suspended, and demo.

---

## 12. SMS Billing

### Roles

| System | Responsibility |
|--------|----------------|
| Bird | Deliver SMS |
| Supabase | Authoritative real-time usage/credit ledger and send authorization |
| Stripe | Financial settlement of overages |

### Initial overage blocks (configurable via Platform later)

| Plan | Block size | Est. cost | Customer price | Cents |
|------|------------|-----------|----------------|-------|
| Servant Standard | 50 SMS | $2.00 | $5.00 | 500 |
| Steward Pro | 100 SMS | $4.00 | $10.00 | 1000 |
| Shepherd Plus | 200 SMS | $8.00 | $20.00 | 2000 |
| Omni Enterprise | 500 SMS | $20.00 | $40.00 | 4000 |

### Auto-replenishment

Support:

- Included monthly SMS allocation
- Consumed / remaining
- Low-balance threshold
- Automatic replenishment (default on for eligible paid orgs)
- Block size / price from catalog (not hard-coded in send path)
- Billing obligation + failed-payment handling
- Grace credits + max automatic blocks
- Usage ledger + billing ledger
- Monthly reset/allocation
- Admin adjustments / refunds
- Atomic / idempotent credit operations (no double block purchase under concurrency)

### Charge aggregation

Prefer accumulating SMS block charges onto the organization’s Stripe subscription invoice / customer balance when appropriate, rather than a separate card charge for every small block. Remain flexible for immediate off-session charges if business rules later require them.

### Continuity vs risk

Do **not** design: balance hits zero → hard stop all SMS → wait for manual purchase.

Do design: low threshold → auto-replenish → on payment failure notify + apply grace → preserve configured emergency capability → never unlimited unpaid usage.

**Phase 1 note:** Today SMS uses **monthly segment quotas** (`messaging.sms.monthly_segment_limit`) with hard stop at limit. Credit-block auto-replenish is a Phase 9 deliverable that extends (does not discard) usage metering.

---

## 13. Generic Extra Billable Items

SMS must not be the only add-on type.

Extra-item catalog should support future:

- SMS credits / blocks
- Additional users, campuses, cameras, sensors, storage
- Premium support, analytics, retention, integrations
- Hardware/service charges

Conceptual attributes: code/key, display name, description, active flag, billing type, quantity, price, cost, applicable plans, Stripe Product/Price IDs, auto-purchase allowed, customer purchase allowed, included quantity, replenishment quantity, effective/retired dates, tax behavior.

---

## 14. Discount / Promotion Codes

Use Stripe Coupons / Promotion Codes for financial processing where practical.

Platform must eventually manage: code, percent or fixed amount, applicable plans/items, duration, start/expiration, max redemptions, per-customer limits, new-customers-only, active flag.

Validate discounts **server-side**. Never trust client-only validation.

---

## 15. Tax

Do **not** hard-code 9.8% (modeling only).

Production tax must be jurisdiction-aware. Prefer **Stripe Tax**.

Support: billing address, tax location, taxability, calculated tax amount, preserved tax history on transactions, future exemptions.

---

## 16. Stripe Checkout

Initial paid onboarding uses Stripe-hosted Checkout unless a compelling existing alternative appears (none today).

Flow:

1. Organization chooses plan  
2. Server creates Checkout Session (resolves internal plan → active price → Stripe Price ID)  
3. Customer pays on Stripe  
4. Webhook updates subscription  
5. Entitlements recalculated  
6. Billing confirmation email  
7. Application access  

**Do not** activate paid subscriptions solely because the browser hits a success URL.

---

## 17. Stripe Customer Portal

Use Portal for:

- Updating / replacing payment methods
- Billing information
- Viewing / downloading invoices

### Recommendation (plan changes)

**Sanctuary Protected should own plan changes** (upgrade/downgrade/cancel-at-period-end) in-app, because plan changes must recalculate entitlements, seat/campus capacity, and SMS allocations.

Customer Portal may remain enabled for payment methods and invoices. If Portal plan switching is enabled in Stripe, webhooks must still drive entitlement sync — prefer disabling Portal subscription changes initially to avoid split-brain UX.

---

## 18. Customer Mapping

Each **billable organization** maps to one Stripe Customer.

```
organization.id (UUID) → Stripe Customer ID
```

Do not treat individual users as the primary subscription owner. Users may hold billing permissions.

---

## 19. Billing Profile

Maintain billing profile data per organization (new table or extended `billing_customers`):

- Provider + provider customer ID
- Billing email / contact name
- Billing address (tax)
- `billing_enabled`
- Complimentary status (or FK/flag)
- Tax metadata
- Timestamps

Do not duplicate organization name/identity fields unnecessarily.

---

## 20. Transaction & Invoice History

Every financial event must be auditable and preferably immutable.

History should cover: subscription charges, SMS/add-on charges, discounts, tax, payments, failed payments, refunds, credits, adjustments.

Prefer append-only transaction/event records. Soft-reference Stripe invoice/payment/refund IDs.

---

## 21. Webhooks

Secure endpoint (existing pattern):

`/api/billing/webhooks/stripe`

Requirements: server-side only, signature verification, reject invalid signatures, idempotent, safe under duplicates/delays/out-of-order events, provider event ID, processing status, timestamps, safe diagnostics without leaking full sensitive payloads.

Existing table `billing_events` is the starting point.

---

## 22. Expected Stripe Events (initial set)

| Event | Why |
|-------|-----|
| `checkout.session.completed` | Bind Checkout → customer/subscription; start paid access only after this (or subsequent invoice.paid) |
| `customer.subscription.created` | Create/sync local subscription |
| `customer.subscription.updated` | Status, price, period, cancel_at_period_end |
| `customer.subscription.deleted` | Cancel / end access path |
| `invoice.created` / `invoice.finalized` | Mirror invoice records |
| `invoice.paid` | Confirm payment; clear past_due; record transaction |
| `invoice.payment_failed` | past_due / dunning / notifications |
| `invoice.payment_action_required` | SCA / customer action |
| `charge.refunded` / `refund.created` / `refund.updated` | Refund tracking |
| `customer.updated` | Billing email/address sync (selective) |

Do not subscribe to unnecessary events. Finalize the live list in `STRIPE_SETUP.md` when enabling the sandbox endpoint.

---

## 23. Idempotency

Must be idempotent:

Checkout Session creation, subscription creation, SMS block purchase, invoice item creation, refunds, webhook processing, subscription updates, plan changes.

Use Stripe idempotency keys + unique DB constraints (provider event IDs, replenishment keys).

---

## 24. Resend Billing Notifications

Every successful charge (and key lifecycle events) should produce branded Sanctuary Protected email via Resend / existing notification pipeline.

Examples: payment confirmation, SMS/add-on charge, refund, failed payment, trial ending/expired, payment method problem, subscription change.

Stripe remains authoritative for financial invoices/receipts. Resend must not invent contradictory amounts.

**Sender:** Use existing sender registry category `billing` (env blueprint already contemplates `billing@sanctuaryprotected.com`). Only use verified domain identities.

---

## 25. Failed Payments / Dunning

Do not immediately delete or permanently disable an org after one failed payment.

Flow:

```
payment failure → past_due → notify → Stripe retry/dunning
  → configurable grace_period → billing restriction → eventual suspended
```

Separate **financial delinquency** from **emergency communication continuity** (configurable grace / emergency SMS policy).

Exact grace days: **business decision** (see open decisions). Recommended default for Phase 2 planning: **7 days** grace after Stripe marks past_due, unless legal/finance sets otherwise.

---

## 26. Refunds

Platform refunds require billing permission, server-side Stripe API, provider refund ID, amount, reason, initiating platform account, timestamp, audit event, internal transaction update, customer notification.

High-value refunds should use stronger confirmation when platform security supports it.

---

## 27. Organization Billing UI (eventual)

Church Settings → Billing & Subscription should show:

- Current plan, monthly price, status, trial, next billing date
- Payment status + payment method summary (from Stripe; never full PAN)
- SMS allocation / usage / remaining / auto-replenish
- Discounts, history, invoices, refunds/credits
- Manage Billing (Customer Portal) button

---

## 28. Permissions

### Organization (to add; naming follows existing catalog style)

| Key | Intent |
|-----|--------|
| `billing.read` | View plan, usage, invoices |
| `billing.manage` | Manage subscription / Checkout |
| `billing.payment_method.manage` | Open portal for payment methods |
| `billing.subscription.manage` | Change/cancel subscription |
| `billing.invoices.read` | Invoice history |
| `billing.transactions.read` | Transaction history |
| `billing.sms_replenishment.manage` | Configure auto-replenish |
| `billing.discount.apply` | Apply promo at Checkout |

**Defaults (recommended):** Owner and co_owner receive manage+read; administrator may receive read (confirm). Do not grant billing to all members.

**Today:** Church billing mutations are owner-role gated only — migrate to permission keys when implemented.

### Platform (extend existing)

Existing: `billing.read_all`, `billing.events.read`, `billing.customer_portal.open`, `subscriptions.*`, `plans.*`, `features.*`

Add as needed: `billing.plans.manage`, `billing.prices.manage`, `billing.refunds.create`, `billing.discounts.manage`, `billing.organizations.manage`, `billing.overrides.manage`, `billing.reports.read`, etc., following `lib/platform/permission-keys.ts` conventions.

Super Admin / `billing_admin` receive full authorized billing access. Never infer platform billing from church roles.

---

## 29. Audit Events

Use existing `audit_logs` / platform admin actions. Examples:

`billing.plan.created|updated`, `billing.price.created|retired`, `billing.subscription.created|changed|canceled`, `billing.organization.billing_enabled|disabled`, `billing.organization.complimentary_enabled|disabled`, `billing.discount.created|applied`, `billing.sms.replenished`, `billing.payment.succeeded|failed`, `billing.refund.created`, `billing.webhook.failed`

Never log: full PANs, CVV, Stripe secret keys, webhook signing secrets, auth tokens.

---

## 30. Client-Supplied Price Protection

Clients send **internal identifiers** (`plan_key`, `extra_item_key`, optional `price_version_id` when selecting a published version).

Servers resolve:

```
identifier → authorized active price → Stripe Price ID → charge amount
```

Never accept a dollar amount from the browser as the charge amount.

---

## 31. Environments

Separate credentials for development/sandbox, preview/staging, and production/live.

Never allow development code to use production financial credentials.

Env var names (secrets not committed):

- `BILLING_PROVIDER`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

Never expose secret keys via `NEXT_PUBLIC_*`.

---

## 32. Mobile Readiness

Billing domain logic lives in reusable server/domain services — not only web UI.

Mobile may later query subscription, plan, trial, SMS usage, history via authenticated APIs. Sensitive payment management may redirect to Stripe-hosted pages.

---

## 33. Phased Delivery (reminder)

1. Review only — **done**  
2. Requirements & architecture docs — **this phase**  
3. Database foundation (after approval)  
4. Stripe sandbox integration  
5. Checkout  
6. Subscription lifecycle  
7. Organization billing UI  
8. Platform billing  
9. SMS billing  
10. Discounts & extra items  
11. Tax hardening  
12. Production hardening  

---

## 34. Open Business Decisions

Recorded from Phase 1. Recommendations are planning defaults until finance/legal confirms.

| # | Decision | Recommendation |
|---|----------|----------------|
| 1 | Trial length cutover 30 → 7 | New orgs get 7 days at Stripe launch; do not retroactively shorten active trials without notice |
| 2 | Existing orgs when prices first seeded | Treat as grandfathered at listed prices once they Checkout; until Checkout, keep manual/complimentary paths |
| 3 | Portal plan switching | Disable initially; in-app plan changes only |
| 4 | SMS before Phase 9 | Keep monthly hard stop; add low-balance warnings |
| 5 | Complimentary model | App flag + charge guard; no $0 Stripe sub required initially |
| 6 | Co-owner billing | Yes — co_owner gets `billing.manage` |
| 7 | Grace days after past_due | 7 days (configurable) |
| 8 | Stripe Tax timing | Enable from first Checkout if address collection is ready; else Phase 11 |
| 9 | Omni seats/SMS vs Shepherd | Keep current seed (same seats/SMS; Omni adds cameras/sensors) unless product expands Omni limits |

---

## 35. Critical Do-Not-Do (summary)

No raw cards; no secrets in git/docs; no client-trusted prices; no success-URL-only activation; no feature gating on Stripe Price IDs; no hard-coded 9.8% tax; no duplicate entitlement or subscription systems; no weakened RLS; no demo billing; no data delete on trial expiry; no immediate shutoff on first failed payment; no Bird-as-billing; no floating-point money; no blind Church→Organization UI rewrite.

---

## Document control

| Version | Date | Notes |
|---------|------|-------|
| 0.1 | 2026-09-18 | Phase 2 initial requirements from enterprise brief + Phase 1 review |

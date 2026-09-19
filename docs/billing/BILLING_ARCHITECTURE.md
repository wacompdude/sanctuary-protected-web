# Sanctuary Protected — Billing Architecture

**Status:** Phase 3 — database foundation landed (`100_billing_foundation.sql`)  
**Companion:** [`BILLING_REQUIREMENTS.md`](./BILLING_REQUIREMENTS.md), [`STRIPE_SETUP.md`](./STRIPE_SETUP.md)  

This document describes how billing integrates with the **existing** Sanctuary Protected stack. Phase 3 adds schema, seeds, RLS, and app permission/trial wiring. Stripe Checkout / Portal remain Phase 4+.

---

## 1. Current State (Phase 1 summary)

### Already live

| Layer | Location |
|-------|----------|
| Plans | `subscription_plans` (`servant_standard`, `steward_pro`, `shepherd_plus`, `omni_enterprise`) |
| Features | `features`, `plan_features` |
| Org subscription | `organization_subscriptions` |
| Overrides | `organization_entitlement_overrides` |
| Usage meters | `subscription_usage`, `subscription_usage_events` |
| Change history | `subscription_change_history` |
| Provider scaffold | `billing_customers`, `billing_events` |
| Adapter contract | `lib/billing/types.ts`, `lib/billing/provider.ts` (unconfigured only) |
| Webhook route | `app/api/billing/webhooks/[provider]/route.ts` |
| Entitlement API | `lib/subscriptions/resolver.ts` (`hasFeature`, `requireFeature`, …) |
| Church billing UI | `app/(app)/settings/billing/*` |
| Platform admin | `/platform/plans`, `/platform/subscriptions`, `/platform/features` |
| Platform billing perms | `billing.read_all`, `billing.events.read`, `billing.customer_portal.open` |
| Demo protection | `is_demo_organization` + snapshot billing scrub |
| Email category | `billing` in sender registry |

### Gaps (post–Phase 3)

- No Stripe SDK / Checkout / Portal handlers (Phase 4+)  
- Stripe Price IDs still null until sandbox setup (Phase 4)  
- Entitlement resolver does not yet enforce subscription access-granting status (Phase 6)  
- SMS credit ledger schema exists; send-path consumption is Phase 9  
- Church billing UI still primarily role-gated; permission keys seeded for Phase 5+  
- No invoice/transaction UI surfaces yet  

### Phase 3 delivered

- `supabase/migrations/100_billing_foundation.sql`  
- Versioned `billing_plan_prices` + denormalized `subscription_plans.monthly_price_cents`  
- `organization_billing_profiles` (keeps `billing_customers` as thin provider map)  
- Extra items / SMS block catalog + prices  
- `billing_invoices`, `billing_transactions`  
- SMS credit balance + ledger scaffolding  
- Org + platform billing permission seeds  
- RLS (authenticated read where appropriate; writes service_role only)  
- Onboarding / `ensureChurchSubscription` trial default = **7 days**  
- Demo snapshot excludes for new financial tables  

---

## 2. Design Principles

1. **Extend, don’t duplicate** — grow `lib/billing/*` and `lib/subscriptions/*`.  
2. **Stripe = money; Supabase = access.**  
3. **Integer cents** for all monetary columns.  
4. **`organization_id`** on all tenant billing rows (not `church_id`).  
5. **Idempotency** at provider + DB layers.  
6. **Charge guards** before every Stripe money-moving call: demo / complimentary / `billing_enabled=false`.  
7. **Server resolves prices** — clients never supply charge amounts.  
8. **Mobile-ready domain services** — no billing business logic only in React components.

---

## 3. Target Domain Model

```
organizations
    │
    ├─ organization_billing_profiles      (NEW / expand billing_customers)
    │       └─ provider_customer_id (Stripe)
    │
    ├─ organization_subscriptions         (EXISTING — enrich)
    │       ├─ plan_id → subscription_plans
    │       └─ billing_plan_price_id → billing_plan_prices (NEW)
    │
    ├─ entitlement resolution             (EXISTING)
    │       plan_features ⊕ org overrides
    │
    ├─ sms / usage ledgers                (EXTEND usage + NEW credit ledger)
    │
    ├─ billing_invoices / transactions    (NEW mirrors)
    │
    └─ billing_events                     (EXISTING webhook log)
```

---

## 4. Integration With Entitlements

### Keep

```ts
hasFeature({ organizationId, featureKey })
requireFeature({ organizationId, featureKey })
getFeatureLimit({ organizationId, featureKey })
```

### Change (Phase 3+)

After loading subscription, if status is **not** access-granting (`trialing|active|past_due|grace_period` — exact set TBD with grace rules):

- Return features disabled / limits zero **or**
- Throw / redirect to billing required

Exceptions:

- Complimentary → grant plan entitlements without Stripe subscription  
- Billing-disabled + complimentary → same  
- Demo → entitlements from plan; charges blocked  

**Never** branch on Stripe Price ID inside feature checks.

---

## 5. Charge Guard (server-side)

Before Checkout, invoice items, off-session charges, or portal session that can mutate paid state:

```
assertOrganizationBillable(organizationId):
  - org exists and usable
  - NOT is_demo_organization
  - billing_enabled !== false
  - NOT is_complimentary (for charge paths; complimentary may still open read-only portal if needed)
  - actor has billing permission
```

Centralize in `lib/billing/guards.ts` (proposed).

---

## 6. Proposed Schema (DRAFT — do not apply)

Names follow existing conventions. Types illustrative.

### 6.1 `billing_plan_prices` (NEW)

Versioned list prices for a plan.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `plan_id` | uuid FK → `subscription_plans` | |
| `currency` | text | `USD` |
| `interval` | `subscription_billing_interval` | month/year |
| `unit_amount_cents` | integer NOT NULL | e.g. 3995 |
| `effective_from` | timestamptz NOT NULL | |
| `effective_to` | timestamptz NULL | retired |
| `is_current_for_new_signups` | boolean | at most one current per (plan, interval) |
| `allows_grandfathering` | boolean | |
| `billing_provider` | text | `stripe` |
| `billing_provider_product_id` | text NULL | |
| `billing_provider_price_id` | text NULL | set in sandbox Phase 4 |
| `status` | text/enum | `draft\|active\|retired` |
| `created_at` / `updated_at` | timestamptz | |

**Indexes/constraints:**

- Unique partial: one `is_current_for_new_signups` per `(plan_id, interval)` where true  
- Unique `(billing_provider, billing_provider_price_id)` where price ID not null  

**Seed (Phase 3):** four monthly prices at 2995 / 3995 / 5995 / 15000. Leave Stripe IDs null until Phase 4.

`subscription_plans.monthly_price_cents` may remain as denormalized “display current” or be deprecated in favor of joining current price — decide in migration review (prefer join to avoid drift).

### 6.2 `organization_billing_profiles` (NEW)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `organization_id` | uuid UNIQUE FK | |
| `billing_provider` | text | default `stripe` |
| `provider_customer_id` | text NULL | Stripe cus_ |
| `billing_email` | text NULL | |
| `billing_contact_name` | text NULL | |
| `billing_address` | jsonb NULL | line1, city, state, postal, country |
| `tax_ids` | jsonb NULL | future |
| `billing_enabled` | boolean NOT NULL DEFAULT true | |
| `is_complimentary` | boolean NOT NULL DEFAULT false | |
| `complimentary_reason` | text NULL | |
| `created_at` / `updated_at` | timestamptz | |

**Relationship to `billing_customers`:** Phase 3 keeps `billing_customers` as the thin provider map and adds `organization_billing_profiles` as the org-level source of truth for flags (complimentary / billing_enabled), address, and tax. Profiles are backfilled from orgs + existing `billing_customers` rows.

### 6.3 Enrich `organization_subscriptions` (ALTER)

Add if missing after inspection:

| Column | Notes |
|--------|-------|
| `billing_plan_price_id` | FK to price version in force for this sub |
| `payment_status` | optional mirror (`ok\|failed\|action_required`) |
| `provider_latest_invoice_id` | optional |

Keep existing: `status`, trial fields, period fields, `billing_customer_id`, `billing_subscription_id`, `cancel_at_period_end`.

### 6.4 `billing_extra_items` (NEW)

| Column | Notes |
|--------|-------|
| `id`, `item_key`, `display_name`, `description` | |
| `item_kind` | `sms_block`, `seat_pack`, `campus_pack`, `generic`, … |
| `is_active` | |
| `customer_purchasable` / `auto_purchase_allowed` | |
| `created_at` / `updated_at` | |

### 6.5 `billing_extra_item_prices` (NEW)

Versioned prices for extras (same versioning ideas as plan prices): amount cents, cost cents (internal), quantity/unit (e.g. 100 SMS), Stripe IDs, effective dates.

### 6.6 `billing_plan_extra_items` (NEW)

Maps which extra items apply to which plans (default SMS block for Steward = 100 / $10).

### 6.7 SMS credit ledger (NEW or extend)

**Option A (recommended):** New tables:

- `organization_sms_credit_balances` — `organization_id`, `balance`, `low_threshold`, `auto_replenish_enabled`, `max_auto_blocks_per_period`, `grace_credits_remaining`, period markers  
- `organization_sms_credit_ledger` — append-only entries: `delta`, `reason`, `idempotency_key` UNIQUE, `related_extra_item_price_id`, `actor`, timestamps  

**Option B:** Extend `subscription_usage_events` with credit semantics — riskier for clarity.

Keep existing monthly segment usage for entitlement reporting; credit ledger becomes send authorization for overage era.

### 6.8 `billing_invoices` (NEW)

Mirror of Stripe invoices: `organization_id`, `provider_invoice_id` UNIQUE, status, amounts (subtotal/tax/total cents), hosted URL, PDF URL, period start/end, raw-safe metadata, timestamps.

### 6.9 `billing_transactions` (NEW)

Append-only financial events: type (`subscription_charge`, `sms_block`, `refund`, `adjustment`, `discount`, `tax`, `failed_payment`, …), amounts, currency, provider IDs, invoice FK, idempotency key, created_at. Prefer no updates except status corrections with audit.

### 6.10 Webhook events

Continue `billing_events`; add columns only if needed (`processed_at`, `retry_count`, `safe_error_summary`) after inspecting current schema.

### 6.11 Trial configuration (NEW small settings)

Prefer `billing_settings` singleton (platform) or env+DB hybrid:

- `trial_enabled`, `trial_days` (default 7), `trial_plan_key`, `trial_requires_payment_method`, `grace_days_after_past_due`

Avoid scattering magic numbers in onboarding actions.

### 6.12 Permissions

**Org catalog** (`lib/security/permission-keys.ts` + migration templates): add `billing.*` keys from requirements.

**Platform catalog:** extend `lib/platform/permission-keys.ts` for prices, refunds, discounts, reports.

### 6.13 RLS principles

- Org members: SELECT billing rows only for orgs they belong to, and only if they hold billing read permission (or owner/co_owner during transition).  
- Mutations: **no** direct client UPDATE on financial tables; service role / server only.  
- Platform: via platform permission checks + admin client, not church RLS bypass in browser.

---

## 7. Proposed Stripe Flow

```
[Web UI] choose plan_key
    → [Server] assertOrganizationBillable + resolve current billing_plan_price
    → Stripe Checkout Session (line_items = price ID; tax; allow_promotion_codes)
    → Customer completes Checkout
    → redirect success URL (show “processing”; do NOT grant paid solely here)
    → webhook checkout.session.completed / subscription.updated / invoice.paid
    → upsert organization_subscriptions + billing profile customer ID
    → entitlement cache invalidated / next hasFeature sees new plan
    → Resend billing confirmation
```

Portal:

```
[Server] createCustomerPortalSession(customerId, returnUrl)
    → Stripe-hosted
    → webhooks sync payment method / invoices
```

---

## 8. SMS Auto-Replenish Flow (Phase 9)

```
sendSms requested
  → entitlement SMS enabled?
  → reserve 1 credit atomically
  → if balance < low_threshold AND auto_replenish AND under max_blocks
        → idempotent create Stripe invoice item / pending block purchase
        → credit ledger += block_size (or credit after invoice.paid — choose one policy)
  → Bird send
  → consume reservation
```

**Recommended credit timing:** Credit immediately on successful invoice-item creation **only if** payment is guaranteed on subscription collection; otherwise credit on `invoice.paid` and use short grace credits for continuity. Document exact choice in Phase 9 design note.

Concurrency: `SELECT … FOR UPDATE` on balance row or single-threaded advisory lock per `organization_id`; unique `idempotency_key` on ledger.

---

## 9. Domain Services (proposed modules)

Follow existing functional style (not mandatory classes):

| Module | Responsibility |
|--------|----------------|
| `lib/billing/guards.ts` | Billable assertions |
| `lib/billing/stripe/client.ts` | Stripe SDK wrapper |
| `lib/billing/stripe/checkout.ts` | Checkout sessions |
| `lib/billing/stripe/portal.ts` | Customer portal |
| `lib/billing/stripe/webhook-handlers.ts` | Event handlers |
| `lib/billing/prices.ts` | Resolve active plan/extra prices |
| `lib/billing/invoices.ts` | Local invoice mirror |
| `lib/billing/transactions.ts` | Ledger writes |
| `lib/billing/notifications.ts` | Resend/billing emails |
| `lib/subscriptions/*` | Keep mutations; call from webhook handlers |
| `lib/sms/credits.ts` | Credit reserve/consume/replenish |

Wire `getBillingProvider()` to return `StripeBillingProvider` when `BILLING_PROVIDER=stripe` and secrets present.

---

## 10. Webhook Processing Architecture

Existing: `processBillingWebhook` verifies → inserts `billing_events` → currently marks ignored.

Target:

1. Verify signature (Stripe)  
2. Insert event (`received`) — unique on `(billing_provider, provider_event_id)`  
3. Dispatch handler by `event_type`  
4. Mark `processed` or `failed` with safe error summary  
5. Duplicate delivery → return 200 without re-applying side effects  

Handlers must be idempotent against subscription/invoice unique provider IDs.

**Endpoint:** keep `/api/billing/webhooks/[provider]` (provider slug `stripe`).

---

## 11. Onboarding Changes (later phases)

| Path | Behavior |
|------|----------|
| Trial | `ensureChurchSubscription({ status: "trialing", periodDays: from billing_settings default 7 })` |
| Immediate purchase | Create org → Checkout for chosen plan → webhook activates `active` |

Do not create a live Stripe subscription for pure trials without card.

---

## 12. Files Likely Touched by Phase

See requirements §16. Phase 2 added `docs/billing/*`. Phase 3 added `supabase/migrations/100_billing_foundation.sql` plus permission/trial wiring.

---

## 13. Migration Order (Phase 3 — applied in `100_billing_foundation.sql`)

1. `billing_settings` (trial_days=7, grace_days=7) — done  
2. `billing_plan_prices` + seed four monthly amounts — done  
3. `organization_billing_profiles` (+ backfill from orgs / billing_customers) — done  
4. Alter `organization_subscriptions` (price FK, payment_status, latest invoice) — done  
5. Extra item tables + SMS package seeds — done  
6. Invoice + transaction tables — done  
7. SMS credit tables — done (consumption logic = Phase 9)  
8. Org + platform permission keys — done  
9. RLS policies — done  
10. Onboarding / ensure-subscription trial default = 7 days — done  

**Apply with your usual Supabase migration workflow** (`supabase db push` / linked remote). Stripe Price IDs remain null until Phase 4.
---

## 14. Reconciliation (Phase 12)

Future job compares:

- Stripe subscriptions vs `organization_subscriptions`  
- Stripe customers vs billing profiles  
- Stripe invoices vs `billing_invoices`  
- Orphaned provider IDs  

Use Vercel cron only when job infrastructure is ready; not required for Phase 3.

---

## 15. Testing Strategy (by phase)

Reuse project scripts: `npm run lint`, project test command, `npm run build`.

Minimum scenarios listed in requirements (40 items) map to Phases 5–12. Phase 2 has no runtime tests.

---

## 16. Risks Register

| Risk | Mitigation |
|------|------------|
| Dual org vs subscription status | Single write path in subscription mutations; document sync rules |
| Manual plan assign vs Stripe | Keep manual path for platform/complimentary; tag `source` in change history |
| Entitlement access not status-aware | Phase 3/6 wire `subscriptionGrantsAccess` |
| SMS model change | Phase 9 parallel run of quota + credits |
| Price NULL → seeded amounts | Explicit migration + platform announcement |
| Webhook out-of-order | Handlers use Stripe object state, not event order alone |

---

## Document control

| Version | Date | Notes |
|---------|------|-------|
| 0.1 | 2026-09-18 | Phase 2 architecture from Phase 1 review |

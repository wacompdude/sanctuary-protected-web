# Stripe Live Configuration Inventory (Phase 5C-3F)

Non-secret operational record. **Do not store secret keys or webhook
signing secrets in this file.**

Repository / Production runtime baseline (Phase 5C-4 final reconciliation):
`f4cfb61` (`f4cfb61c524bfa90aa81a764104b1d14bd342cfc`) · migration **115**.

---

## Account

| Field | Value |
|-------|--------|
| Account ID | `acct_1UGx3WRxaGtyRkAV` |
| Legal business (Stripe) | Unified Protective Technologies, LLC |
| Stripe account name | Unified Protective Technologies, LLC |
| Mode for these objects | **Live** |
| Wrong account (do not use) | `acct_1UGx3gRpikFGVYxt` |
| Timezone | America/Los_Angeles |

### Addresses (do not conflate)

| Role | Address |
|------|---------|
| Stripe verified / business address (account) | 402 Avenue E, Snohomish, WA 98290, United States — **do not auto-replace** |
| Public / customer-facing / Tax head-office mailing | 522 West Riverside Avenue, Suite N, Spokane, WA 99201, United States |
| Legal config `MAILING_ADDRESS` | 522 W Riverside Ave Ste N, Spokane, WA 99201-0581, United States |

### Public brand (Stripe Checkout / receipts)

| Field | Value |
|-------|--------|
| Public business name | Sanctuary Protected, LLC |
| Website | https://sanctuaryprotected.com |
| Support email | support@sanctuaryprotected.com |
| Support phone | +1 (425) 408-1479 |
| Terms | https://sanctuaryprotected.com/terms |
| Privacy | Configured in Stripe |
| Support URL | Configured in Stripe |
| Statement descriptor | **SANCTUARY PROTECTED** |
| Brand color | `#166534` |
| Accent color | `#16a34a` |
| Prefer logo over icon | Enabled |
| Custom Checkout domain | Not configured (not required for initial launch) |

---

## Live catalog (lookup-key authoritative)

Application resolves prices by **lookup key**, not hard-coded `price_` IDs.
Catalog resolution verifies: active price, USD, unit amount, recurring monthly
vs one-time. It does **not** currently assert product tax code at resolve time
(product tax code is set in Stripe Dashboard).

### Monthly subscriptions (recurring / month / USD / Active / tax exclusive / `txcd_10103001`)

| Plan | Amount | Lookup key |
|------|--------|------------|
| Servant Standard | $29.95 | `servant_standard_monthly` |
| Steward Pro | $39.95 | `steward_pro_monthly` |
| Shepherd Plus | $59.95 | `shepherd_plus_monthly` |
| Omni Enterprise | $150.00 | `omni_enterprise_monthly` |

No Stripe `trial_period_days`. Trial remains the application-managed 7-day
no-card local trial (D-01).

### SMS packages (one-time / USD / Active / tax exclusive / `txcd_10103001`)

| Package | Amount | Credits | Lookup key |
|---------|--------|---------|------------|
| Servant Standard SMS Credits | $5.00 | 50 | `servant_standard_sms_50` |
| Steward Pro SMS Credits | $10.00 | 100 | `steward_pro_sms_100` |
| Shepherd Plus SMS Credits | $20.00 | 200 | `shepherd_plus_sms_200` |
| Omni Enterprise SMS Credits | $40.00 | 500 | `omni_enterprise_sms_500` |

Account-level Stripe Tax fallback category: **General - Electronically Supplied
Services**. Product-specific **`txcd_10103001` (SaaS – business use)** is
authoritative for these eight products.

---

## Live webhook

| Field | Value |
|-------|--------|
| Name | Sanctuary Protected Billing - Live |
| Destination ID | `we_1UTFhmRxaGtyRkAVY4mx4fGj` |
| Status | Active |
| Endpoint | `https://sanctuaryprotected.com/api/billing/webhooks/stripe` |
| Scope | Account |
| Payload | Snapshot |
| API version | `2026-08-26.dahlia` |
| Events | Exactly 14 code-required events |
| Signing secret | Created; stored by owner; **not** in Vercel; **not** in repo |
| Live deliveries expected yet | **No** |

### Required events

```
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.paid
invoice.payment_failed
subscription_schedule.created
subscription_schedule.updated
subscription_schedule.released
subscription_schedule.canceled
subscription_schedule.completed
subscription_schedule.aborted
payment_intent.succeeded
payment_intent.payment_failed
```

---

## Live restricted server key

| Field | Value |
|-------|--------|
| Name | Sanctuary Protected Server Billing - Live |
| Mode | Live |
| Stored by owner | Yes |
| Installed in Vercel | **No** |
| Secret in repo | **No** |
| Summary | 10 permissions · 4 Read · 6 Write |

### Permissions (least-privilege baseline — do not broaden unless proven)

| Resource | Access |
|----------|--------|
| Checkout Sessions | Write |
| Customers | Write |
| Invoices | Read |
| Payment Intents | Write |
| Payment Methods | Read |
| Prices | Read |
| Products | Read |
| Setup Intents | Write |
| Subscriptions | Write |
| Tax Calculations, Transactions | Write |
| Refunds / Disputes / Portal / Tax Settings & Registrations / Webhooks / Payouts / Transfers | None |

### Permission audit notes

- **`POST /v1/invoices/create_preview`** (upgrade preview): code uses
  `stripe.invoices.createPreview`. Static SDK confirms endpoint path.
  Whether Invoices=**Read** is sufficient cannot be proven without a Live
  call → **RUNTIME VALIDATION REQUIRED** (do not broaden until proven).
- **Subscription schedules** (downgrade): code uses
  `subscriptionSchedules.create|retrieve|update|release`. Dashboard indicated
  these are covered by Subscriptions=**Write** → treat as covered; smoke
  validation later when Live Checkout is authorized.
- Code uses **`tax.calculations.create` only** (not Tax Transactions create).
  Transactions Write is extra but acceptable.
- No Portal, Refund Write, or Dispute mutations required for initial Live.

---

## PHASE 5C-3F CHECKPOINT 4 — LIVE STRIPE ACCOUNT READINESS

**Recorded:** 2026-10-22 (Phase 5C-3F Checkpoint 4)

| Sub-checkpoint | Result |
|----------------|--------|
| 4A Tax | **PASS** |
| 4B Business / Branding | **PASS** |
| 4C Customer emails | **PASS** |
| 4D Payment methods | **PASS** |
| 4E Publishable key identified | **PASS** (not installed) |
| 4F Restricted key least-privilege review | **PASS** (with runtime-validation notes) |

### 4A Tax

- Stripe Tax monitoring setup complete.
- Head office / Tax setup address: Spokane public mailing address above.
- Washington DOR Excise Tax account verified (owner).
- Washington DOR classifications noted: B&O Retailing; Sales and Use Retail Sales.
- Washington added in Stripe Tax as **existing registration**, type **Sales tax**,
  collection start **Immediately**.
- Stripe confirmed Sales tax collection in Washington starting immediately.
- Calculation display: 6.5% + local (destination-based; **not** Spokane-universal).
- **No other state registrations.**
- **Automatic filing NOT enabled** (do not enable).
- Filing/remittance and B&O remain external compliance.

Tax policy (unchanged):

- Customer destination/billing/service location drives tax.
- Do not charge WA tax to out-of-state customers solely because seller is in WA.
- Monitor nexus over time; no universal nexus threshold in app code.
- Stripe Tax = calculation/monitoring technology, not legal nexus authority.

### 4B Business / Branding

- Statement descriptor: `SANCTUARY PROTECTED`
- Checkout branding + receipt preview verified (Sanctuary Protected, LLC).
- Snohomish verified address left as-is (not replaced with Spokane).

### 4C Customer emails

- Successful payments: **ON**
- Refunds: **ON**
- Support reply email: support@sanctuaryprotected.com
- Intended ownership: Stripe = payment/refund receipts; Sanctuary/Resend =
  account, trial, plan-change, security, SMS-credit operational notices.

### 4D Payment methods

Enabled exactly:

- Cards
- Apple Pay
- Google Pay

**Link: DISABLED.** All other methods disabled (35 total disabled per owner).
Do not enable ACH, bank debit, Cash App, BNPL, crypto, Link, or local methods
without explicit approval.

### 4E Publishable key

- Live `pk_live_…` exists for this account.
- **Not** installed in Vercel.
- App reads `STRIPE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
  (publishable only; never secret).

### Credentials / gate status (still true)

| Item | Status |
|------|--------|
| Live restricted key in Vercel | **No** |
| Live publishable key in Vercel | **No** |
| Live webhook secret in Vercel | **No** |
| `assertSandboxCatalogValidationMode` | **Still active** (blocks Live Checkout) |
| Live customer / charge / Checkout Session | **None** |
| Automatic filing | **Off** |
| Other tax registrations | **None** |

---

## PRE-LIVE READINESS AUDIT (static)

Audit date: 2026-10-22. No Live mutations. No Vercel changes. No commit required
by this audit itself.

### Application env vars (names only)

| Variable | Purpose | Context | Live later? |
|----------|---------|---------|-------------|
| `BILLING_PROVIDER` | Must be `stripe` | Server | Yes |
| `STRIPE_SECRET_KEY` | Restricted/server secret (`rk_live_` / `sk_live_`) | Server only | Yes (restricted key) |
| `STRIPE_PUBLISHABLE_KEY` | Preferred publishable | Server → billing UI | Yes (`pk_live_`) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Alias if server name empty | May be client | Yes (publishable only) |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret | Server only | Yes (Live secret) |
| `STRIPE_SUBSCRIPTION_TAX_COLLECTION` | Gate; must be `authorized` | Server | Keep authorized |
| `STRIPE_SMS_TAX_COLLECTION` | Gate; must be `authorized` | Server | Keep authorized |

### Live Checkout gate

`assertSandboxCatalogValidationMode` in `lib/billing/stripe/catalog.ts`, called
from subscription Checkout (`checkout.ts`) and SMS Checkout (`sms-checkout.ts`).
Throws `StripeLiveModeForbiddenError` if secret is `sk_live_` / `rk_live_`.

**If Live credentials are installed while the gate remains:** Checkout Session
creation for subscription and SMS packages fails closed. Webhooks and some
non-Checkout paths are not gated the same way — do not remove the gate until
Preview isolation and controlled cutover are ready.

### Payment method code vs Dashboard

| Flow | Code behavior | Compatible with Cards/Apple Pay/Google Pay? |
|------|---------------|-----------------------------------------------|
| Subscription Checkout | No `payment_method_types` override → Dashboard dynamic methods | Yes |
| SMS Checkout | `allowed_payment_method_types: ["card"]` (wallets are card) | Yes |
| SetupIntents (sub + SMS auto PM) | `allowed_payment_method_types: ["card"]` | Yes |
| Auto replenishment PaymentIntent | `allowed_payment_method_types: ["card"]` | Yes |

No Link/ACH/BNPL required by code.

### Customer Portal

`customerPortal: false`; `createCustomerPortalSession` throws
`BillingNotImplementedError`. Matches D-14 OFF.

### Receipts / Resend

- No `receipt_email` assignment in application Stripe calls.
- Stripe Dashboard successful-payment and refund emails ON → Stripe owns receipts.
- Resend maps operational types including `billing.payment_succeeded` /
  `billing.refund_processed` — risk of **duplicate** customer payment emails if
  those Resend templates send receipt-like content. Prefer Stripe for payment
  receipts; keep Resend for operational/status notices. **Do not change in this
  audit.**

### Tax code paths

- Subscription Checkout: `automatic_tax.enabled` when
  `STRIPE_SUBSCRIPTION_TAX_COLLECTION=authorized`; requires org billing address
  synced to Stripe Customer (destination), not Spokane HQ.
- SMS Checkout: independent SMS tax gate + automatic_tax when authorized.
- Auto replenishment: `tax.calculations.create` with customer billing address;
  no hardcoded 6.5% / Spokane rate in code.

### Webhook cutover note

Live destination `we_1UTFhmRxaGtyRkAVY4mx4fGj` uses Production URL
`https://sanctuaryprotected.com/api/billing/webhooks/stripe`.
Sandbox destination **Sanctuary Protected Billing - Test** (same URL) is
**DISABLED**. Production `STRIPE_WEBHOOK_SECRET` is the Live signing secret
(deployed). Sandbox events cannot verify against the Live secret.

### Preview / Production isolation

**Confirmed by owner (cutover staging):** Vercel Stripe env vars are
**Production only**. Preview must not receive Live `STRIPE_*` secrets.

---

## LIVE CREDENTIAL CUTOVER — DEPLOYED (GATE STILL ACTIVE)

**Recorded:** 2026-10-22 (Phase 5C-3F post-deploy + pre-transaction audit)

### Deployment

| Item | Status |
|------|--------|
| Deployed commit | `69474e3` (`69474e36687282d0feba7bc5ba6fb612d7176431`) |
| Vercel Stripe variables | **Production only** |
| `STRIPE_SECRET_KEY` | Live restricted `rk_live_…` (value not recorded) |
| `STRIPE_PUBLISHABLE_KEY` | Live `pk_live_…` (value not recorded) |
| `STRIPE_WEBHOOK_SECRET` | Live destination `we_1UTFhmRxaGtyRkAVY4mx4fGj` (secret not recorded) |
| `STRIPE_SUBSCRIPTION_TAX_COLLECTION` | `authorized` |
| `STRIPE_SMS_TAX_COLLECTION` | `authorized` |
| Sandbox webhook → Production URL | **DISABLED** |
| `assertSandboxCatalogValidationMode` | **ACTIVE** (blocks Live Checkout) |
| Intentional Live Customer / Checkout / PI / SetupIntent | **None** |
| Application SMS during cutover | **None** |
| Replenishment / reconciliation invoked | **None** (Attempt #7 absent) |
| Migration | **115** latest · **116** absent |

### Post-deploy Stripe Connectivity Diagnostic (Production)

| Check | Result | Notes |
|-------|--------|-------|
| HTTPS/DNS/TLS | **PASS** | HTTP 404 on probe URL; 18 ms (expected for this probe) |
| Stripe SDK read (`prices.list`) | **PASS** | HTTP 200; 89 ms — restricted Live key accepted |
| Account identity | **MATCH** (HTTP **403**) | `StripePermissionError` / `more_permissions_required` — **expected** under least privilege; **do not** add Accounts permission for a greener diagnostic |
| Exact Checkout Catalog Resolution | **PASS** | HTTP response received; 66 ms — Live lookup-key catalog works |

Interpretation: Live API connectivity + catalog resolution proven. Account 403 is not a defect.

### Pre-transaction blockers (static audit)

1. ~~**P0 — Sandbox Stripe Customer ID mapping (controlled org)**~~ — **CLEARED**
   (see CONTROLLED SANDBOX→LIVE LINKAGE RESET below). **All five** remaining Sandbox-linked
   orgs remapped (see remediations 1–5 of 5). Final active-linkage audit: only the
   controlled Live org retains an active Stripe Customer mapping.
2. **P1 — Auto-replenish:** Controlled org disabled via UI; Sandbox `pm_` cleared.
   Keep Application SMS avoided until first controlled Live Checkout. Threshold
   display discrepancy (stored 49 vs UI default 10) left untouched.
3. **Checkout gate:** Remains required until an approved enable-flag change.
4. **`invoices.createPreview`:** Still **RUNTIME VALIDATION REQUIRED** (not needed
   for first Checkout).

---

## CONTROLLED SANDBOX→LIVE LINKAGE RESET

**Executed:** 2026-10-23T06:34:12Z (Phase 5C-3G)

| Field | Value |
|-------|--------|
| Organization | Sanctuary SMS Tax Test |
| Organization ID | `a5246f30-84dc-4f8e-b27f-03390e8cadbe` |
| Stripe API calls | **NONE** |
| Live Customer created | **No** |
| Migration | **115** latest · **116** absent |
| Other organizations modified | **0** |

### Pre-clear masked active linkage

| Field | Before |
|-------|--------|
| `organization_billing_profiles.provider_customer_id` | `cus_…5lYd` |
| `billing_customers.provider_customer_id` | `cus_…5lYd` |
| `organization_subscriptions.billing_subscription_id` | `sub_…l5CJ` |
| `organization_subscriptions.provider_schedule_id` | `NULL` |
| `organization_subscriptions.provider_latest_invoice_id` | `in_…a5UR` |
| `organization_sms_auto_replenishment.payment_method_id` | `pm_…KJRj` |

Pre-clear internal state: tier `servant_standard`, status `active`, payment `ok`,
SMS available **50** / reserved **0**, auto-replenish **disabled**, attempts **6**,
Attempt #7 absent. Billing events count **7**, invoices count **1**.

### Fields cleared

| Field | After | Notes |
|-------|-------|--------|
| `organization_billing_profiles.provider_customer_id` | **NULL** | |
| `billing_customers` row (stripe) | **DELETED** | Column is `NOT NULL`; null update impossible. Deleting the legacy mirror row removes active Sandbox linkage (equivalent objective). |
| `organization_subscriptions.billing_subscription_id` | **NULL** | |
| `organization_subscriptions.provider_schedule_id` | **NULL** | Already null; left null |
| `organization_subscriptions.provider_latest_invoice_id` | **NULL** | |
| `organization_sms_auto_replenishment.payment_method_id` | **NULL** | Status remained **disabled**; threshold **49** / cap **2500** unchanged |

### Preserved (verified)

- Entitlement: `servant_standard` / `active` / `payment_status=ok` / same `plan_id`
- SMS balance: **50** available, **0** reserved
- Auto-replenishment: **disabled**
- Attempts: **6** (Attempt #7 absent)
- Historical `billing_events`, `billing_invoices`, replenishment attempts / ledger: **unchanged**
- Other five Sandbox-linked organizations: **untouched** (still 5 profile + 5 `billing_customers` mappings)

Future Live Customer must be created **lazily** by the first approved Live
SMS-credit Checkout after Checkout-gate enablement.

### Live Checkout authorization flag (implemented)

Server-only env var:

`STRIPE_LIVE_CHECKOUT_ENABLED`

| Value | Live Checkout |
|-------|----------------|
| missing / empty | **BLOCKED** |
| `false` | **BLOCKED** |
| `1` / `TRUE` / any other string | **BLOCKED** |
| exact `true` | **Permitted** |

Central helper: `assertStripeCheckoutModeAllowed` (subscription + SMS Checkout).
Sandbox/`sk_test_`/`rk_test_` Checkout does **not** require this flag.
Catalog validation (`assertSandboxCatalogValidationMode`) remains sandbox-only
even when the flag is `true`.

**Do not** use `NEXT_PUBLIC_STRIPE_LIVE_CHECKOUT_ENABLED`.

#### Staged Production procedure (before first Live transaction)

1. Deploy code containing this fail-closed flag while Production flag is
   **absent or `false`**
2. Verify Live Checkout remains blocked
3. Explicitly set **Production-only**: `STRIPE_LIVE_CHECKOUT_ENABLED=true`
4. Redeploy/restart as required by Vercel
5. Execute **one** approved controlled SMS-credit Checkout
6. Observe webhook + database result
7. Return flag to **absent/`false`** if broad customer Live Checkout is not
   yet authorized

Preview/Development must **not** receive Live Stripe credentials.

### Recommended first Live transaction (design only — not executed)

**SMS-credit Checkout** (plan-matched package; lowest critical path after remapping),
not subscription Checkout and not SetupIntent-only.

Rationale: one-time charge validates Customer (Live), Tax, Checkout Session,
`checkout.session.completed` / payment webhooks, and SMS credit ledger with
smaller irreversible surface than starting a Live recurring subscription.
Requires prior Sandbox→Live customer remapping and auto-replenish safety.

---

## Not done yet (later phases)

1. ~~Preview/Production Stripe env isolation~~
2. ~~Stage Live credentials in Vercel Production~~
3. ~~Disable Sandbox Production-URL webhook~~
4. ~~Deploy with Live Checkout gate still on~~
5. ~~Non-transactional Live catalog / connectivity diagnostic~~
6. ~~Clear active Sandbox Stripe linkage for controlled org~~
7. ~~Auto-replenish disabled (UI) + Sandbox PM cleared~~
8. ~~Implement fail-closed `STRIPE_LIVE_CHECKOUT_ENABLED`~~ (code ready; Production
   flag remains absent/false until explicitly authorized)
9. Deploy gate code with Production flag absent/false; verify still blocked
10. Set Production-only `STRIPE_LIVE_CHECKOUT_ENABLED=true` then one controlled
    Live SMS-credit Checkout (lazy Live Customer create)
11. Return Production flag to false/absent if not broadly authorizing Live Checkout
12. ~~Remap remaining Sandbox-linked orgs before their Live use~~
    (~~1/5 First Church~~ · ~~2/5 Sanctuary Protected Test~~ ·
    ~~3/5 Billing Failure Test~~ · ~~4/5 SMS Test Servant~~ · ~~5/5 RBC~~)
13. Invoice createPreview runtime permission check (upgrade path)
14. Downgrade schedule smoke; later SMS auto-replenish Live validation

---

## REMAINING SANDBOX REMEDIATION — 1 OF 5

**Executed:** 2026-10-23T07:36:52Z (Phase 5C-3J)

| Field | Value |
|-------|--------|
| Organization | First Church of the First Church |
| Organization ID | `d8e32fd9-f9b1-4650-b07a-c06ed94076f1` |
| Stripe API calls | **NONE** |
| Live Customer created | **No** |
| Live transaction | **No** |
| Migration | **115** latest · **116** absent |
| Code | `f4cfb61` |
| Live Checkout | remains **fail-closed** (`STRIPE_LIVE_CHECKOUT_ENABLED` ≠ exact `true`) |
| Other organizations modified | **0** |

### Pre-clear masked active linkage

| Field | Before |
|-------|--------|
| `organization_billing_profiles.provider_customer_id` | `cus_…8L2U` |
| `billing_customers.provider_customer_id` | `cus_…8L2U` (exactly 1 stripe row) |
| `organization_subscriptions.billing_subscription_id` | **NULL** |
| `organization_subscriptions.provider_schedule_id` | **NULL** |
| `organization_subscriptions.provider_latest_invoice_id` | **NULL** |
| Auto-replenishment | **none** |
| SMS balance row | **none** |
| Attempts / events / invoices / txns / ledger | **0** |

Pre-clear internal state: tier `omni_enterprise`, status `active`,
`payment_status=unknown`, period `2026-07-26` → `2026-08-25` (stale/expired —
**preserved intentionally**; not fixed in this remediation),
`cancel_at_period_end=false`.

### Fields cleared

| Field | After | Notes |
|-------|--------|--------|
| `organization_billing_profiles.provider_customer_id` | **NULL** | |
| `billing_customers` row (stripe) | **DELETED** (exactly 1) | Column is `NOT NULL`; null update impossible |

### Preserved (verified)

- Entitlement: `omni_enterprise` / `active` / `payment_status=unknown` / same `plan_id`
- Billing period dates: **exactly unchanged** despite stale end date
- `cancel_at_period_end=false`
- SMS / auto-replenishment / history counts: unchanged (all zero or absent)
- Successful controlled Live org (`a5246f30-…cadbe`): Live `cus_…S24E`, SMS **100**/0,
  auto **disabled**, attempts **6** — **untouched**
- Remaining Sandbox-linked orgs (RBC, SMS Test Servant, Protected Test, Billing Failure):
  **untouched**

Future Live Customer for First Church: lazy via `customers.create` →
`saveMappedCustomerId` on first authorized Live Checkout.

---

## REMAINING SANDBOX REMEDIATION — 2 OF 5

**Executed:** 2026-10-23T07:42:20Z (Phase 5C-3J)

| Field | Value |
|-------|--------|
| Organization | Sanctuary Protected Test |
| Organization ID | `33f94b26-bb71-4219-8ed9-4ac716869394` |
| Stripe API calls | **NONE** |
| Live Customer created | **No** |
| Live transaction | **No** |
| Migration | **115** latest · **116** absent |
| Code | `f4cfb61` |
| Live Checkout | remains **fail-closed** |
| Other organizations modified | **0** |

### Pre-clear masked active linkage

| Field | Before |
|-------|--------|
| `organization_billing_profiles.provider_customer_id` | `cus_…Z8jc` |
| `billing_customers.provider_customer_id` | `cus_…Z8jc` (exactly 1 stripe row) |
| `organization_subscriptions.billing_subscription_id` | `sub_…u7xK` |
| `organization_subscriptions.provider_schedule_id` | **NULL** |
| `organization_subscriptions.provider_latest_invoice_id` | `in_…o9qv` |
| Auto-replenishment | **none** |
| SMS balance row | **none** |
| Attempts | **0** |
| Events / invoices / txns / ledger | **4** / **1** / **1** / **0** |

Pre-clear internal state: tier `servant_standard`, status `active`,
`payment_status=ok`, period `2026-10-15` → `2026-11-15`,
`cancel_at_period_end=false`.

### Fields cleared

| Field | After | Notes |
|-------|--------|--------|
| `organization_billing_profiles.provider_customer_id` | **NULL** | |
| `billing_customers` row (stripe) | **DELETED** (exactly 1) | `provider_customer_id` is NOT NULL |
| `organization_subscriptions.billing_subscription_id` | **NULL** | Active Sandbox sub linkage only |
| `organization_subscriptions.provider_schedule_id` | **NULL** | Already null; left null |
| `organization_subscriptions.provider_latest_invoice_id` | **NULL** | |

### Preserved (verified)

- Entitlement: `servant_standard` / `active` / `payment_status=ok` / same `plan_id`
- Billing period dates: **exactly unchanged**
- `cancel_at_period_end=false`
- Historical counts unchanged: events **4**, invoices **1**, txns **1**, ledger **0**, attempts **0**
- Controlled Live org: Live `cus_…S24E`, SMS **100**/0, auto **disabled**, attempts **6** — **untouched**
- First Church remediation: customer **NULL**, mirror absent, `omni_enterprise`/`active` — **intact**
- RBC, SMS Test Servant, Billing Failure Test: **untouched**

Future Live Customer: lazy `customers.create` → `saveMappedCustomerId`.
Future Live subscription: **new** Live subscription Checkout/webhook only — do not reuse cleared Sandbox `sub_…u7xK`.

---

## REMAINING SANDBOX REMEDIATION — 3 OF 5

**Executed:** 2026-10-23T07:49:56Z (Phase 5C-3J)

| Field | Value |
|-------|--------|
| Organization | Sanctuary Billing Failure Test |
| Organization ID | `54832cf5-f074-41a8-958b-f752fb2965f7` |
| Stripe API calls | **NONE** |
| Live Customer created | **No** |
| Live transaction | **No** |
| Migration | **115** latest · **116** absent |
| Code | `f4cfb61` |
| Live Checkout | remains **fail-closed** |
| Other organizations modified | **0** |

### Pre-clear masked active linkage

| Field | Before |
|-------|--------|
| `organization_billing_profiles.provider_customer_id` | `cus_…4Kes` |
| `billing_customers.provider_customer_id` | `cus_…4Kes` (exactly 1 stripe row) |
| `organization_subscriptions.billing_subscription_id` | `sub_…fIKN` |
| `organization_subscriptions.provider_schedule_id` | **NULL** |
| `organization_subscriptions.provider_latest_invoice_id` | `in_…UiKy` |
| Auto-replenishment | **none** |
| SMS balance row | **none** |
| Attempts | **0** |
| Events / invoices / txns / ledger | **10** / **2** / **3** / **0** |

Pre-clear internal state: tier `servant_standard`, status `active`,
`payment_status=ok`, period `2026-11-16` → `2026-12-16`,
`cancel_at_period_end=false`.

### Failure-test history (preserved, not normalized)

Includes intentional Sandbox failure evidence among historical rows:

- `invoice.payment_failed` (processed)
- `failed_payment` transaction status `failed`
- plus succeeded payments / paid invoices / subscription webhook history

These remain historical Sandbox evidence only — not active Live payment failures.

### Fields cleared

| Field | After | Notes |
|-------|--------|--------|
| `organization_billing_profiles.provider_customer_id` | **NULL** | |
| `billing_customers` row (stripe) | **DELETED** (exactly 1) | `provider_customer_id` is NOT NULL |
| `organization_subscriptions.billing_subscription_id` | **NULL** | Active Sandbox sub linkage only |
| `organization_subscriptions.provider_schedule_id` | **NULL** | Already null; left null |
| `organization_subscriptions.provider_latest_invoice_id` | **NULL** | |

### Preserved (verified)

- Entitlement: `servant_standard` / `active` / `payment_status=ok` / same `plan_id`
- Billing period dates: **exactly unchanged**
- `cancel_at_period_end=false`
- Historical counts unchanged: events **10**, invoices **2**, txns **3**, ledger **0**, attempts **0**
- Historical outcome rows unchanged (including failed payment evidence)
- Controlled Live org: Live `cus_…S24E`, SMS **100**/0, auto **disabled**, attempts **6** — **untouched**
- First Church + Sanctuary Protected Test remediations: **intact**
- RBC + SMS Test Servant: **untouched**

Future Live Customer: lazy `customers.create` → `saveMappedCustomerId`.
Future Live subscription: **new** Live subscription only — do not reuse cleared Sandbox `sub_…fIKN`.

---

## REMAINING SANDBOX REMEDIATION — 4 OF 5

**Executed:** 2026-10-23T07:56:30Z (Phase 5C-3J)

| Field | Value |
|-------|--------|
| Organization | Sanctuary SMS Test - Servant |
| Organization ID | `072c0dfb-e628-40ff-b71e-05636a15fb5e` |
| Stripe API calls | **NONE** |
| Application SMS / replenishment | **NONE** |
| Live Customer created | **No** |
| Live transaction | **No** |
| Migration | **115** latest · **116** absent |
| Code | `f4cfb61` |
| Live Checkout | remains **fail-closed** |
| Other organizations modified | **0** |

### Pre-clear masked active linkage

| Field | Before |
|-------|--------|
| `organization_billing_profiles.provider_customer_id` | `cus_…QF9r` |
| `billing_customers.provider_customer_id` | `cus_…QF9r` (exactly 1 stripe row) |
| `organization_subscriptions.billing_subscription_id` | `sub_…XR6H` |
| `organization_subscriptions.provider_schedule_id` | **NULL** |
| `organization_subscriptions.provider_latest_invoice_id` | `in_…PFHJ` |
| Auto-replenishment | **disabled** · PM **NULL** · attempts **0** |
| SMS available / reserved | **49** / **0** |
| Events / invoices / txns / ledger | **4** / **1** / **2** / **3** |

Pre-clear internal state: tier `servant_standard`, status `active`,
`payment_status=ok`, period `2026-10-12` → `2026-11-12`,
`cancel_at_period_end=false`.

### SMS ledger consistency (read-only, pre-clear)

| Ledger | Delta | Reason |
|--------|-------|--------|
| 1 | +50 | `manual_purchase` (Sandbox Checkout `cs_test_…`) |
| 2 | 0 | `reserve` |
| 3 | −1 | `consume` |
| **Sum** | **49** | equals balance **49** · reserved **0** |

No reconciliation performed.

### Fields cleared

| Field | After | Notes |
|-------|--------|--------|
| `organization_billing_profiles.provider_customer_id` | **NULL** | |
| `billing_customers` row (stripe) | **DELETED** (exactly 1) | `provider_customer_id` is NOT NULL |
| `organization_subscriptions.billing_subscription_id` | **NULL** | Active Sandbox sub linkage only |
| `organization_subscriptions.provider_schedule_id` | **NULL** | Already null; left null |
| `organization_subscriptions.provider_latest_invoice_id` | **NULL** | |

### Preserved (verified)

- Entitlement: `servant_standard` / `active` / `payment_status=ok` / same `plan_id`
- Billing period dates: **exactly unchanged**
- SMS financial state: available **49** / reserved **0** / ledger **3** rows unchanged
- Auto-replenishment: **disabled** · PM **NULL** · attempts **0**
- Historical counts unchanged: events **4**, invoices **1**, txns **2**, ledger **3**, attempts **0**
- Controlled Live org: Live `cus_…S24E`, SMS **100**/0, auto **disabled**, attempts **6** — **untouched**
- First Church + Protected Test + Billing Failure remediations: **intact**
- RBC: still Sandbox-linked (`cus_…e012` / `sub_…RbRP` / schedule present) — **untouched** (org 5)

Future Live Customer: lazy `customers.create` → `saveMappedCustomerId`.
Future Live subscription: **new** Live subscription only — do not reuse cleared Sandbox `sub_…XR6H`.
Existing **49** SMS credits remain independent of any future Live Customer/Subscription.

---

## REMAINING SANDBOX REMEDIATION — 5 OF 5

**Executed:** 2026-10-23T08:03:06Z (Phase 5C-3J)

| Field | Value |
|-------|--------|
| Organization | RBC |
| Organization ID | `76f88490-0b60-4df6-8a7f-6a2f405caa50` |
| Stripe API calls | **NONE** |
| Application SMS / replenishment | **NONE** |
| Live Customer created | **No** |
| Live transaction | **No** |
| Migration | **115** latest · **116** absent |
| Code | `f4cfb61` |
| Live Checkout | remains **fail-closed** |
| Other organizations modified | **0** |

### Schedule revalidation (mandatory pre-clear)

| Check | Result |
|-------|--------|
| `schedule_status` | **released** |
| Released at | `2026-10-10T06:32:25Z` |
| Historical `scheduled_plan_id` | Servant Standard |
| Historical `scheduled_effective_at` | `2026-11-08T08:40:14Z` |
| Current tier | **steward_pro** (unchanged) |
| `subscription_schedule.released` event | present / processed |
| Pending downgrade / newer schedule request | **none** |
| Classification | **SAFE TO CLEAR PROVIDER SCHEDULE ONLY** |

Released Sandbox schedule carried **no** pending business intent.
RBC must **not** become Servant as a result of clearing schedule mirror fields.

### Pre-clear masked active linkage

| Field | Before |
|-------|--------|
| `organization_billing_profiles.provider_customer_id` | `cus_…e012` |
| `billing_customers.provider_customer_id` | `cus_…e012` (exactly 1 stripe row) |
| `organization_subscriptions.billing_subscription_id` | `sub_…RbRP` |
| `organization_subscriptions.provider_schedule_id` | `sub_sched_…gWFq` |
| `organization_subscriptions.provider_latest_invoice_id` | `in_…sGyL` |
| Schedule mirror | status `released` · scheduled Servant · effective 2026-11-08 |
| SMS available / reserved | **100** / **0** |
| Events / invoices / txns / ledger | **14** / **2** / **3** / **1** |

### SMS ledger consistency (read-only)

| Ledger | Delta | Reason |
|--------|-------|--------|
| 1 | +100 | `manual_purchase` (Sandbox Checkout `cs_…`) |
| **Sum** | **100** | equals balance **100** · reserved **0** |

### Fields cleared

| Field | After | Notes |
|-------|--------|--------|
| `organization_billing_profiles.provider_customer_id` | **NULL** | |
| `billing_customers` row (stripe) | **DELETED** (exactly 1) | |
| `billing_subscription_id` | **NULL** | |
| `provider_latest_invoice_id` | **NULL** | |
| `provider_schedule_id` | **NULL** | |
| `scheduled_plan_id` | **NULL** | Released mirror only |
| `scheduled_effective_at` | **NULL** | |
| `schedule_status` | **NULL** | |
| `schedule_requested_by` | **NULL** | |
| `schedule_requested_at` | **NULL** | |
| `schedule_released_at` | **NULL** | Historical events retained |

### Preserved (verified)

- Entitlement: **steward_pro** / `active` / `payment_status=ok` / same Steward Pro `plan_id`
- Periods unchanged · `cancel_at_period_end=false`
- SMS: **100**/0 · ledger **1** row unchanged · attempts **0**
- Historical counts unchanged: events **14**, invoices **2**, txns **3**, ledger **1**
- Historical schedule events (including `subscription_schedule.released`) retained
- Prior remediations 1–4: **intact**
- Controlled Live org: Live `cus_…S24E`, SMS **100**/0, auto **disabled**, attempts **6** — **untouched**

### Final Production active-linkage audit

| Active mapping type | Remaining (non-controlled) | Controlled Live org |
|---------------------|----------------------------|---------------------|
| Customer (profile) | **0** | `cus_…S24E` present |
| Customer (`billing_customers`) | **0** | present |
| Subscription | **0** | none |
| Schedule | **0** | none |
| Latest invoice | **0** | none |

**Verdict:** all known Production Sandbox Stripe active linkages remediated.

Future RBC Live Customer: lazy `customers.create` → `saveMappedCustomerId`.
Future RBC Live subscription: **new** Live subscription only.
Future Steward→Servant downgrade: requires a **new** explicit request and, if applicable,
a **new** Live schedule — never auto-recreate the released Sandbox schedule.

---

## PHASE 5C-4 FINAL RECONCILIATION — PRE-LIVE SUBSCRIPTION SMOKE GO

**Recorded:** 2026-10-24 (operator Dashboard confirmations + Cursor read-only revalidation)

**Verdict:** **GO** — ready for **one** controlled Live Servant Standard subscription smoke test.

**Not performed during reconciliation:** Live Checkout enablement, Checkout Session,
Customer/Subscription/Invoice/PaymentIntent creation, charge, refund, SMS, email,
deploy, env change, runtime-code change.

### Operator-verified external evidence (accepted)

| Item | Confirmed state |
|------|-----------------|
| Production deployment | Ready · `main` · **`f4cfb61`** · “Implement fail-closed Live Stripe Checkout gate” |
| Vercel Stripe vars scoping | **Production only** for `STRIPE_LIVE_CHECKOUT_ENABLED`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_SMS_TAX_COLLECTION`, `STRIPE_SUBSCRIPTION_TAX_COLLECTION` |
| Live Checkout flag | **`STRIPE_LIVE_CHECKOUT_ENABLED=false`** (fail-closed; deploy after return-to-false) |
| Live webhook | **Active** · `we_1UTFhmRxaGtyRkAVY4mx4fGj` · `https://sanctuaryprotected.com/api/billing/webhooks/stripe` · API `2026-08-26.dahlia` · 14 events · 2 deliveries / 0 failed |
| Sandbox webhook | **DISABLED** (same Production URL; no Sandbox→Production delivery) |
| Live catalog | All 8 products Active · tax code **`txcd_10103001`** |
| Servant Standard price | Lookup **`servant_standard_monthly`** · **$29.95/month** · Active |
| Publishable key | Live **`pk_live_…`** |
| Restricted server key | **Sanctuary Protected Server Billing - Live** · Active · Limited · **`rk_live_…`** |
| Restricted permissions | 10 total (4 Read / 6 Write) as previously inventoried; **Accounts: NONE** |
| Stripe Tax plan | **Tax Basic** (pay-as-you-go; operator did **not** enroll Tax Complete / automatic filing) |
| Washington tax | **1 registration** · status **Collecting tax** · Needs attention **0** · Not collecting **0** |
| Automatic Stripe filing | **Not enabled** |

### Cursor-verified application / database (read-only)

| Item | Result |
|------|--------|
| Repo HEAD / `origin/main` | `f4cfb61c524bfa90aa81a764104b1d14bd342cfc` (matches Production) |
| Migration | **115** latest · **116** absent |
| Runtime-code drift vs `f4cfb61` | **None** (docs-only dirty tree acceptable) |
| Checkout gate | Exact `=== "true"` · `assertStripeCheckoutModeAllowed` before Customer + Checkout (subscription + SMS) |
| Active Sandbox linkage | Customer **0** · Subscription **0** · Schedule **0** · Latest invoice **0** · Auto PM **0** |
| Auto enabled + usable Live PM | **0** |
| Controlled Live SMS org | `a5246f30-…cadbe` · Live `cus_…S24E` · SMS **100**/0 · auto **disabled** · PM **NULL** · attempts **6** · Attempt #7 **absent** · exactly **one** `cs_live_…` SMS purchase (**500** + **53** = **553**) |
| Remediated orgs 1–5 | Remain clean of active Sandbox linkage; RBC `steward_pro` + SMS 100/0; SMS Test Servant 49/0; First Church `omni_enterprise` |
| Recommended subscription smoke org | **Sanctuary Protected Test** `33f94b26-bb71-4219-8ed9-4ac716869394` |
| Pre-state (Protected Test) | `servant_standard` / `active` / `payment_status=ok` · Customer/Sub/Schedule/Invoice **NULL** · mirrors **0** · auto absent · address **complete** · events **4** · invoices **1** · txns **1** |
| Subscription tax code path | `automatic_tax.enabled` when `STRIPE_SUBSCRIPTION_TAX_COLLECTION=authorized`; no hardcoded WA / 10.55% rate |
| Tax env flags | **CONSISTENT WITH VERIFIED BASELINE** (`authorized`) + Production-only scoping + prior Live SMS tax success + WA Collecting tax |
| Success/cancel URLs | **PASS WITH SAFE PRODUCTION HOST FALLBACK** (initiate smoke only from `sanctuaryprotected.com`) |
| Receipt ownership | **Stripe** (`notifyBillingCharge` remains no-op) |
| `invoices.createPreview` | **Not required** for initial subscription |

### Controlled smoke org immediate pre-state

| Field | Value |
|-------|--------|
| Organization | Sanctuary Protected Test |
| ID | `33f94b26-bb71-4219-8ed9-4ac716869394` |
| plan_id | `c59e9ba6-6a0d-435a-a953-b1a7b25348e1` (`servant_standard`) |
| status / payment_status | `active` / `ok` |
| period | `2026-10-15T07:32:11Z` → `2026-11-15T07:32:11Z` |
| cancel_at_period_end | `false` |
| provider_customer_id | **NULL** |
| billing_customers mirrors | **0** |
| billing_subscription_id | **NULL** |
| provider_schedule_id | **NULL** |
| provider_latest_invoice_id | **NULL** |
| scheduled_* / schedule_status | **NULL** |
| SMS / auto / PM | no balance row · auto not configured · PM **NULL** |
| counts | events **4** · invoices **1** · txns **1** · attempts **0** |

Future Live Customer idempotency: `sp_customer_org_33f94b26-bb71-4219-8ed9-4ac716869394`.

### Post-test subscription strategy (recommendation only)

**Leave active temporarily (A)** on this isolated test org to observe the first real
Live monthly renewal, with Live Checkout returned to **`false` immediately after
payment**. Record `current_period_end` after creation and monitor intentionally.
If renewal validation is declined, use **cancel_at_period_end (B)** after smoke
validation. Do not leave unmonitored indefinitely.

### Next operator action (not executed here)

Temporarily set Production-only `STRIPE_LIVE_CHECKOUT_ENABLED=true`, redeploy **same**
`f4cfb61` runtime, execute exactly one Servant Standard Checkout for Sanctuary
Protected Test, then immediately return the flag to `false` and redeploy.

---

## PHASE 5C-5 — FIRST LIVE SUBSCRIPTION POST-PAYMENT VERIFICATION

**Recorded:** 2026-10-24 (read-only Production audit after controlled Checkout)

**Verdict:** **FIRST CONTROLLED LIVE SERVANT STANDARD SUBSCRIPTION VERIFIED END-TO-END**

**Audit mutations:** **NONE** (no Stripe/DB/env/code/deploy changes).

### Controlled organization

| Field | Value |
|-------|--------|
| Name | Sanctuary Protected Test |
| ID | `33f94b26-bb71-4219-8ed9-4ac716869394` |
| Plan | `servant_standard` · lookup `servant_standard_monthly` |

### Transaction amounts (Stripe Tax authoritative)

| Field | Value |
|-------|--------|
| Subtotal | **$29.95** (2995¢) |
| Tax | **$3.16** (316¢) · Checkout displayed **10.55%** |
| Total | **$33.11** (3311¢) |
| Currency | USD |
| Checkout | complete / paid |
| Invoice | paid · `billing_reason=subscription_create` |

### Safe-masked Live Stripe objects

| Object | ID (masked) | Mode |
|--------|-------------|------|
| Customer | `cus_…G1Eu` | Live (new; pre-state NULL) |
| Subscription | `sub_…HboS` | Live |
| Invoice | `in_…1Gzi` | Live (`/live_` hosted invoice URL on `acct_1UGx3WRxaGtyRkAV`) |
| PaymentIntent | `pi_…EY5F` | Live · succeeded · 3311¢ |
| PaymentMethod | `pm_…VYE2` | Live (subscription default; UI masked Visa) |
| Price | `price_…0EMT` | Live · `servant_standard_monthly` |
| Checkout Session | stored redacted in webhook metadata; correlated complete/paid · 2995+316=3311 · `automatic_tax.enabled=true` status complete | Live |

### Billing period / renewal

| Source | Start | End |
|--------|-------|-----|
| Stripe item periods | `2026-10-24T07:00:45Z` | `2026-11-24T07:00:45Z` |
| `organization_subscriptions` | `2026-10-24T07:00:45Z` | `2026-11-24T07:00:45Z` |
| Next renewal | **`2026-11-24T07:00:45Z`** (base $29.95 + Stripe-recalculated tax) |

### Webhooks (this transaction)

| Event | Outcome |
|-------|---------|
| `invoice.paid` | **processed** — invoice + transaction recorded |
| `customer.subscription.created` | **processed** — active / servant_standard |
| `checkout.session.completed` | **processed** — non-authoritative entitlement correlate |
| `payment_intent.succeeded` | **ignored** (not SMS auto-replenishment) — correct |

Org `billing_events`: **4 → 7**. Idempotent; no duplicate Customer/Subscription/transaction for this payment.

### Duplicate / safety checks

| Check | Result |
|-------|--------|
| Live Customers for org | **1** |
| Active Live Subscriptions | **1** |
| New paid Invoice for this payment | **1** |
| Successful PaymentIntent | **1** |
| Internal succeeded txn for this invoice | **1** |
| SMS balance / grant | **none** (still no SMS row) |
| Auto-replenishment | not configured · PM **NULL** · attempts **0** |
| Active Sandbox linkage | **0 / 0 / 0 / 0 / 0** |
| Other orgs modified | **0** (SMS Tax Test / First Church / SMS Servant / RBC / Billing Failure Test unchanged) |
| Live Checkout flag | **OPERATOR VERIFIED** restored to `false` (fail-closed for new Checkout) |
| Runtime | `f4cfb61` · migration **115** |

### Receipt ownership

Stripe owns payment/invoice receipt (Live hosted invoice URL present). Sanctuary/`notifyBillingCharge` remains no-op — **no duplicate Sanctuary receipt**.

### Retention recommendation (not executed)

**A — Leave active temporarily** through first Live renewal at **`2026-11-24T07:00:45Z`** on this isolated test org, with Live Checkout kept **fail-closed**. Monitor invoice/webhook/DB at renewal; then decide cancel_at_period_end if desired.

---

## PHASE 5D-1 — PAID SUBSCRIPTION LIFECYCLE READINESS AUDIT

**Recorded:** 2026-10-24 (read-only code + Production inventory)

**Verdict:** **PHASE 5D LIFECYCLE TESTING READY WITH CONTROLLED SEQUENCE**

**Audit mutations:** **NONE**

### Protected first Live renewal control

| Field | Value |
|-------|--------|
| Org | Sanctuary Protected Test `33f94b26-bb71-4219-8ed9-4ac716869394` |
| Subscription | `sub_…HboS` · Servant Standard · active |
| Renewal | **`2026-11-24T07:00:45Z`** |
| Protection | **DO NOT** upgrade / downgrade / cancel / change PM / Checkout |

### Lifecycle implementation summary (code-verified)

| Operation | Mechanism | Immediate charge? |
|-----------|-----------|-------------------|
| Upgrade | `subscriptions.update` · `proration_behavior=always_invoice` · `payment_behavior=error_if_incomplete` · anchor unchanged · webhook writes `plan_id` | **YES** (prorated) |
| Downgrade | Subscription Schedule · `proration_behavior=none` · `end_behavior=release` · period-end | **NO** |
| Cancel at period end | `subscriptions.update({ cancel_at_period_end })` · keep/resume supported | **NO** |
| Immediate cancel | **Not implemented** (user-facing) | — |
| Payment method change | SetupIntent `usage=off_session` · purpose `subscription_payment_method_replacement` · updates **subscription** default PM only | **NO** |
| Customer Portal | capability **false** / not implemented | — |
| Renewal | Stripe unattended invoice · webhooks | **YES** at period end |
| Checkout gate | Checkout Sessions only — **does not** gate upgrade/downgrade/cancel/SetupIntent/renewal | — |

### Critical inventory finding

Production currently has **exactly one** org with `billing_subscription_id` set:

Sanctuary Protected Test (renewal control).

Therefore Phase 5D mutation tests require a **separate** Live paid subscription before upgrade/downgrade/cancel/PM tests.

### Recommended controlled sequence

0. Provision dedicated lifecycle org (or promote Billing Failure Test) via **one** controlled Live Servant Checkout (temporary Checkout flag) — **not** Protected Test  
1. 5D-5 Payment method change (no charge)  
2. 5D-2 Upgrade Servant→Steward (immediate prorated charge)  
3. 5D-3 Downgrade schedule Steward→Servant + release  
4. 5D-4 Cancel at period end + keep  
5. 5D-6 Failed-payment readiness (Dashboard/config + read-only)  
6. 5D-7 Protected Test genuine renewal `2026-11-24T07:00:45Z`

### Safety gate recommendations (do not implement yet)

- Checkout gate remains for Checkout only  
- Upgrade is **LIVE TEST CONTROL RISK** (real charge without Checkout flag) → temporary operator discipline and/or future Production-only upgrade gate advised before broad Live use  
- Prefer dedicated lifecycle org for all mutation tests  

### Migration decision

**NO MIGRATION** — schema sufficient; migration 116 not required for Phase 5D.

### Runtime

`f4cfb61` · migration **115** · `STRIPE_LIVE_CHECKOUT_ENABLED=false` (operator-verified)

---

## PHASE 5D-0 — Dedicated Live Billing Lifecycle Test Subscription

**Recorded:** 2026-10-24 (read-only Stage B post-payment verification)

**Verdict:** **DEDICATED LIVE BILLING LIFECYCLE SUBSCRIPTION PROVISIONED AND VERIFIED**

**Audit mutations:** **NONE** (no Stripe/DB/env/code/deploy/commit changes during Stage B).

### Organization

| Field | Value |
|-------|--------|
| Name | Sanctuary Billing Lifecycle Test |
| ID | `522a0d7e-9849-4ec6-ba23-318308f437bd` |
| Plan | `servant_standard` · lookup `servant_standard_monthly` |
| Subscription status | `active` |
| Account status | `active` |
| Payment status | `ok` |
| `cancel_at_period_end` | `false` |
| Stripe trial | **NONE** |
| Subscription Schedule | **NONE** |
| Scheduled downgrade | **NONE** |
| Owner | active `owner` |

### Customer reuse (Phase 5D-0 success criterion)

| Check | Result |
|-------|--------|
| Pre-existing Customer reused | **YES** (`cus_…Bhn7`) |
| Profile `provider_customer_id` | `cus_…Bhn7` (unchanged) |
| `billing_customers` mirrors | **1** (same Customer; created before Checkout via Billing & Tax Address save) |
| Duplicate Customer | **NONE** |
| Live mode | **YES** (Live hosted invoice URL; Live account suffix on Sub/Invoice IDs) |

### Safe-masked Live Stripe objects

| Object | ID (masked) | Notes |
|--------|-------------|--------|
| Customer | `cus_…Bhn7` | Reused; org metadata correct |
| Checkout Session | redacted in webhook metadata | `mode=subscription` · `status=complete` · `payment_status=paid` · qty **1** · no SMS product |
| Subscription | `sub_…ydeZ` | Live · `active` · `servant_standard_monthly` · 2995¢/month |
| Invoice | `in_…n4yC` | Live · `paid` · `billing_reason=subscription_create` |
| PaymentIntent | `pi_…1P26` | Live · `succeeded` · 3274¢ |
| PaymentMethod | `pm_…Cg3i` | Subscription payment (from PI); **not** SMS auto PM |
| Price | `price_…0EMT` | `servant_standard_monthly` |

### Financial reconciliation (actual)

| Field | Value |
|-------|--------|
| Subtotal | **2995¢** ($29.95) |
| Tax | **279¢** ($2.79) |
| Displayed/effective rate | Checkout UI **9.3%** · computed 279/2995 ≈ **9.32%** |
| Total / amount paid | **3274¢** ($32.74) |
| Currency | USD |
| Cross-check | Checkout Session = Invoice = PaymentIntent = internal txn — **match** |
| vs Protected Test tax | Prior controlled sub used **10.55%** — different location/tax jurisdiction; Stripe Tax authoritative |

### Billing period / next renewal

| Source | Start | End |
|--------|-------|-----|
| Stripe item periods | `2026-10-24T07:51:44Z` | `2026-11-24T07:51:44Z` |
| `organization_subscriptions` | `2026-10-24T07:51:44Z` | `2026-11-24T07:51:44Z` |
| UI | 10/24/2026 → 11/24/2026 | |
| Next renewal | **`2026-11-24T07:51:44Z`** (base $29.95 + Stripe-recalculated tax) |

### Webhooks (this transaction)

| Event | Outcome |
|-------|---------|
| `payment_intent.succeeded` | **ignored** (not SMS auto-replenishment) — correct |
| `checkout.session.completed` | **processed** — correlate only; `authoritative_activation=false` |
| `customer.subscription.created` | **processed** — active / servant_standard |
| `invoice.paid` | **processed** — invoice + transaction + org activation |
| Failed relevant events | **0** |
| Duplicate fulfillment | **NONE** |

### Duplicate audit

| Object | Count |
|--------|-------|
| Live Customers | **1** |
| Active Live Subscriptions | **1** |
| Completed subscription Checkout Sessions | **1** |
| Initial paid subscription Invoices | **1** |
| Succeeded initial PaymentIntents | **1** |
| Internal successful subscription txns | **1** |
| Subscription schedules | **0** |

### SMS isolation / PM separation

| Check | Result |
|-------|--------|
| SMS balance | **absent** (no row) |
| SMS ledger | **0** entries |
| Auto-replenishment | not configured · PM **NULL** · attempts **0** |
| Subscription PM vs SMS auto PM | **PASS** (subscription PM present; `organization_sms_auto_replenishment.payment_method_id` NULL) |

### Protected controls (unchanged)

| Org | Result |
|-----|--------|
| Sanctuary Protected Test `33f94b26-…` | `sub_…HboS` · active/ok · period end **`2026-11-24T07:00:45Z`** · no Phase 5D-0 events/txns |
| Sanctuary SMS Tax Test `a5246f30-…` | SMS **100/0** · auto disabled · attempts **6** · Attempt #7 **absent** · no new subscription |
| First Church / Billing Failure / SMS Servant / RBC | no new Customer/Sub/Schedule/Invoice/PM/txn/SMS grant from Phase 5D-0 |

### Sandbox linkage / Checkout safety / receipt

| Check | Result |
|-------|--------|
| Active Sandbox linkage | **0 / 0 / 0 / 0 / 0** (Customer/Sub/Schedule/Latest invoice/Auto PM) |
| Live Checkout flag | **OPERATOR VERIFIED** `STRIPE_LIVE_CHECKOUT_ENABLED=false` after redeploy |
| Static gate | exact `=== "true"` (unchanged; Checkout only) |
| Receipt ownership | Stripe owns payment/invoice receipt (Live hosted URL). `notifyBillingCharge` remains **no-op** — **no** Sanctuary/Resend duplicate receipt |

### Local trial transition

| Before | After |
|--------|-------|
| Local `trialing` · trial end `2026-10-31T07:35:18Z` | `status=active` · `payment_status=ok` · account `active` |
| Stripe trial | **NONE** |
| Historical `trial_start` / `trial_end` | **retained** for audit (not cleared) |

### Phase readiness (do not execute here)

| Phase | Readiness |
|-------|-----------|
| **5D-5** Payment method change | **READY FOR PHASE 5D-5 PAYMENT METHOD CHANGE TEST** |
| **5D-2** Servant→Steward upgrade | Structurally ready; **real prorated charge**; upgrade **bypasses** Checkout gate; `invoices.createPreview` needs runtime validation; `subscriptions.update` lacks idempotency key |

### Retained P2 / future findings (do not fix in 5D-0)

- Billing & Tax Address save can create Live Customer while Checkout is fail-closed
- Upgrade `subscriptions.update` has no idempotency key
- Upgrade bypasses Checkout gate
- `invoices.createPreview` requires runtime validation before 5D-2
- Subscription Schedule API permission requires runtime validation before 5D-3
- Paid invoice row may retain `amount_due_cents=total` after payment (known P2 semantics)

### Runtime / migration

`f4cfb61` · migration **115** · migration **116** absent · **NO MIGRATION REQUIRED** · Checkout fail-closed

---

## PHASE 5D-5A — Subscription Payment Method Change Preflight

**Recorded:** 2026-10-24 (read-only; no SetupIntent / PM / Subscription mutations)

**Verdict:** **PHASE 5D-5 PAYMENT METHOD TEST READY**

### Target

| Field | Value |
|-------|--------|
| Organization | Sanctuary Billing Lifecycle Test |
| ID | `522a0d7e-9849-4ec6-ba23-318308f437bd` |
| Plan | `servant_standard` · active · `payment_status=ok` |
| Customer | `cus_…Bhn7` (1 mirror) |
| Subscription | `sub_…ydeZ` |
| Current PM (from initial PI) | `pm_…Cg3i` |
| Period | `2026-10-24T07:51:44Z` → `2026-11-24T07:51:44Z` |
| Schedule / cancel_at_period_end | NULL / `false` |
| Owner | active `owner` |

### Architecture summary

| Step | Implementation |
|------|----------------|
| UI | Billing → **Subscription payment method** → **Change payment method** |
| Auth | `requireBillingManageAccess` → owner / co_owner only |
| SetupIntent | `usage=off_session` · card · purpose `subscription_payment_method_replacement` · metadata org + subscription · Customer from server `canonicalBillingTarget` |
| Completion | Server retrieves SetupIntent; verifies purpose/customer/org/subscription/status; then `subscriptions.update({ default_payment_method })` only |
| Customer invoice default | **not** written |
| Tax | Read-back refuses save if `automatic_tax` would drop |
| Charge | **NO** (SetupIntent only; no Invoice/PI/proration) |
| SMS | Purpose distinct from `sms_auto_replenishment_payment_setup`; subscription path does not write SMS auto PM |
| Checkout flag | **not required**; may remain `false` |
| Webhooks | Completion is **synchronous** app action; `setup_intent.*` not in 14-event set — sufficient |

### Pre-mutation snapshot (compare after 5D-5B)

- Customer `cus_…Bhn7` · Sub `sub_…ydeZ` · Invoice `in_…n4yC` · PM `pm_…Cg3i`
- Invoices **1** · txns **1** · org events **3**
- SMS balance absent · reserved 0 · auto absent · SMS PM NULL · attempts 0
- Protected Test `sub_…HboS` period end `2026-11-24T07:00:45Z` unchanged
- SMS Tax Test 100/0 · attempts 6 · Attempt #7 absent

### Findings

| Severity | Item |
|----------|------|
| — | **No P0 / P1** for PM replacement |
| P2 (retain) | SetupIntent create idempotent; `subscriptions.update` finalize has no Stripe idempotency key (duplicate finalize re-sends same narrow update — harmless) |
| P2 (retain prior) | Address-save Live Customer / upgrade idempotency / upgrade Checkout bypass / createPreview / Schedule API / invoice amount_due semantics |

### Expected 5D-5B financial effect

**NO CHARGE EXPECTED** (SetupIntent only). Operator must use a **different** card than `pm_…Cg3i`.

---

## PHASE 5D-5 — Subscription Payment Method Change Test

**Recorded:** 2026-10-24 (read-only Stage B post-mutation audit)

**Verdict:** **SUBSCRIPTION PAYMENT METHOD CHANGE VERIFIED — NO CHARGE**

**Audit mutations:** **NONE**

### Target

| Field | Value |
|-------|--------|
| Organization | Sanctuary Billing Lifecycle Test `522a0d7e-9849-4ec6-ba23-318308f437bd` |
| Old PM | `pm_…Cg3i` · Visa ·••• **9244** (operator/UI pre-state) |
| New PM | `pm_…qcW7` · Visa ·••• **8103** (audit + operator UI) |
| SetupIntent | Not stored in app DB (`setup_intent.*` not in 14-event webhook set). Completion proven by server finalize → audit `billing.subscription_payment_method_updated` at `2026-10-24T08:18:01Z` after purpose/customer/org/subscription verification |
| Purpose | `subscription_payment_method_replacement` (code-enforced before update) |

### No-charge / preservation results

| Check | Result |
|-------|--------|
| Subscription charge | **NO** |
| New paid Invoice | **0** (count remains **1** · `in_…n4yC` · 2995+279=3274) |
| New subscription PaymentIntent | **0** |
| New successful billing txn | **0** (count remains **1**) |
| Plan / price | `servant_standard` / `servant_standard_monthly` unchanged |
| Period | `2026-10-24T07:51:44Z` → `2026-11-24T07:51:44Z` unchanged |
| cancel / schedule | `false` / NULL |
| Tax | No tax charge; address untouched; PM path refuses save if automatic_tax would drop |
| Customer invoice default | App does **not** write `invoice_settings.default_payment_method` |
| SMS balance / auto PM / attempts | absent · NULL · **0** (new PM **not** SMS auto PM) |
| Checkout flag | remained **false** · no Checkout Session |
| Org events | **3 → 4** (`customer.subscription.updated` processed · plan/status unchanged) |
| Protected Test | `sub_…HboS` · period end `2026-11-24T07:00:45Z` unchanged |
| SMS Tax Test | 100/0 · attempts 6 · Attempt #7 absent |
| Active Sandbox linkage | **0 / 0 / 0 / 0 / 0** |

### P2 note

Finalize `subscriptions.update` still has no explicit Stripe idempotency key. This controlled test produced **one** successful intended PM replacement · **one** final subscription PM · **no** duplicate charge/invoice/txn.

---

## PHASE 5D-2A — Paid Subscription Upgrade Readiness & Safety Preflight

**Recorded:** 2026-10-28 (read-only; **no** `createPreview` / `subscriptions.update` / Checkout)

**Verdict:** **PHASE 5D-2 PAID UPGRADE TEST NOT READY — SAFETY HARDENING REQUIRED**

### Target

| Field | Value |
|-------|--------|
| Organization | Sanctuary Billing Lifecycle Test `522a0d7e-9849-4ec6-ba23-318308f437bd` |
| Current | `servant_standard` · `servant_standard_monthly` · active/ok · `sub_…ydeZ` · `cus_…Bhn7` |
| Current PM | `pm_…qcW7` · Visa ·••• **8103** |
| Period / renewal | `2026-10-24T07:51:44Z` → **`2026-11-24T07:51:44Z`** |
| Target | `steward_pro` · `steward_pro_monthly` · **3995¢** · tax code `txcd_10103001` (catalog inventory) |
| Financial effect | **IMMEDIATE REAL PRORATED CHARGE EXPECTED** (`always_invoice` + `error_if_incomplete`) |

### Architecture (code-verified)

| Concern | Finding |
|---------|---------|
| Preview | `stripe.invoices.createPreview` · same item/price/`always_invoice`/`billing_cycle_anchor={type:unchanged}` as update · tax if `STRIPE_SUBSCRIPTION_TAX_COLLECTION=authorized` |
| Execution | `stripe.subscriptions.update` · **no** Stripe idempotency key |
| Checkout gate | **does not** protect upgrade |
| Plan write | webhook only (`organization_subscriptions.plan_id`) |
| UI Confirm | disabled without successful preview · `pending` disables button |
| Server Confirm | does **not** require a prior preview token |

### Critical findings (reclassified)

| ID | Severity | Finding |
|----|----------|---------|
| UPG-IDEM | **P1** | Upgrade `subscriptions.update` lacks Stripe idempotency key. Double-submit / concurrent tabs / timeout-retry can both observe `servant_standard` and each call `always_invoice` → **duplicate proration invoice/charge risk**. |
| UPG-PREVIEW-PERM | **RUNTIME VALIDATION REQUIRED** | `invoices.createPreview` with Invoices=**Read** still unproven on Live restricted key. API is non-persisting simulation, but permission not proven. |
| UPG-GATE | **P2** | No `STRIPE_LIVE_*` fail-closed gate for upgrades (Checkout flag irrelevant). Recommend before general Live use; controlled test still blocked by P1 first. |

### Recommended next phases (do not implement here)

1. **Phase 5D-2A.2 — Upgrade Idempotency & Fail-Closed Safety Hardening**  
   Add Stripe idempotency key scoped to org+subscription+source→target+period (or server mutation id); consider short-lived upgrade mutation lock; optional `STRIPE_LIVE_SUBSCRIPTION_UPGRADES_ENABLED===true` gate that does **not** block renewals/webhooks.

2. **Phase 5D-2A.1 — Live Upgrade Preview Runtime Validation — NON-MUTATING**  
   One authorized Live `invoices.createPreview` for Lifecycle Test only; prove Invoices Read suffices; capture sample proration+tax; still **no** `subscriptions.update`.

### Unchanged controls

Protected Test `sub_…HboS` renewal **`2026-11-24T07:00:45Z`** · SMS Tax Test 100/0 attempts 6 · Checkout **false** · Sandbox active linkage **0** · runtime `f4cfb61` · migration **115**

---

## PHASE 5D-2A.2 — Upgrade Idempotency & Fail-Closed Safety Hardening

**Recorded:** 2026-10-28 (implementation) · **Deployed:** 2026-10-29 (Production)

**Verdict:** **PHASE 5D-2A.2 COMPLETE — UPGRADE IDEMPOTENCY AND FAIL-CLOSED SAFETY HARDENING DEPLOYED AND VERIFIED**

### Prior P1 (closed by this phase)

| ID | Was | Now |
|----|-----|-----|
| UPG-IDEM | **P1** — no Stripe idempotency on `subscriptions.update` | **RESOLVED** — deterministic `upgrade_v1_{org}_{sub}_{from}_{to}_{periodEndUnix}` passed as Stripe request option `idempotencyKey` |

### Implemented controls

| Control | Design |
|---------|--------|
| Stripe idempotency | `buildSubscriptionUpgradeIdempotencyKey` · org + subscription + fromPlan + toPlan + periodEndUnix · stable across retries · different for later period / different target |
| Preview binding | Server-signed HMAC token (`BILLING_UPGRADE_PREVIEW_SIGNING_SECRET`) · opaque `previewAuthorization` on preview response · required on confirm |
| Preview claims | org, subscriptionId, baseItemId, fromPlan, toPlan, periodEndUnix, prorationDateUnix, automaticTax, targetPriceId, exp |
| Preview TTL | **15 minutes** · expired/tampered/mismatched → fail closed with stale-preview message · no silent regenerate |
| Proration timestamp | Server captures unix second at preview · same value for `subscription_details.proration_date` (createPreview) and `proration_date` (subscriptions.update) |
| Source-state revalidation | Immediate before update: live plan/item, schedule absence, `cancel_at_period_end=false`, eligibility · mismatch → fail closed |
| Live upgrade gate | `STRIPE_LIVE_SUBSCRIPTION_UPGRADES_ENABLED` · **exact** `"true"` only · missing/empty/false/FALSE/TRUE/1/yes blocked · test-mode upgrades allowed without Live gate |
| Gate scope | Operator-initiated Live `subscriptions.update` only · **not** renewals · **not** webhooks · **not** Checkout · **not** createPreview |
| Checkout independence | `STRIPE_LIVE_CHECKOUT_ENABLED` unchanged and independent |
| Client amounts | Display-only · confirm does **not** accept client amount/tax/subtotal |

### Environment variables (server-only)

```
STRIPE_LIVE_SUBSCRIPTION_UPGRADES_ENABLED=false
BILLING_UPGRADE_PREVIEW_SIGNING_SECRET=<operator-generated ≥32 chars>
```

- Do **not** set upgrade gate to `true` until Phase 5D-2B.
- Do **not** put either value in `NEXT_PUBLIC_*`.
- Do **not** reuse `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / Bird secrets for preview signing.
- Absent signing secret → upgrade preview/confirm fail closed (configuration error).
- Absent/false upgrade gate → Live `subscriptions.update` fail closed.

### Operator Production env (configured; values not recorded)

| Variable | Production status |
|----------|-------------------|
| `STRIPE_LIVE_SUBSCRIPTION_UPGRADES_ENABLED` | **PRESENT** · operator-configured **`false`** · code requires exact `"true"` |
| `STRIPE_LIVE_CHECKOUT_ENABLED` | **PRESENT** · remains **`false`** |
| `BILLING_UPGRADE_PREVIEW_SIGNING_SECRET` | **PRESENT** · server-only · **VALUE NOT RECORDED** · not `NEXT_PUBLIC_*` |

### Tests (pre-deploy)

- `npm run selfcheck:billing` **PASS**
- `npx tsc --noEmit -p tsconfig.json` **PASS**
- `npm run build` **PASS**

### Migration

**NONE** (no schema change; migration remains **115**; **116 absent**).

### Deployment status

| Field | Value |
|-------|--------|
| Commit | **`3ddb05dce65d7e5f2052ddda73a2142479fd1f0e`** (`3ddb05d`) |
| Message | Harden Live subscription upgrade safety |
| Prior runtime | `f4cfb61` |
| Production host | `https://sanctuaryprotected.com` |
| `/api/health` | `ok:true` · commit **`3ddb05d…`** |
| Vercel Production project | `wacompdude-sanctuary-protected-web` |
| Financial mutations | **NONE** (no Live `createPreview` / `subscriptions.update` / charge / Checkout) |

### Post-deploy RO org state (2026-10-29)

| Org | Result |
|-----|--------|
| Lifecycle Test | `servant_standard` · active/ok · cancel false · schedule NULL · period end `2026-11-24T07:51:44Z` · `sub_…ydeZ` · invoice **1** · txn **1** · latest `in_…n4yC` · SMS attempts **0** · auto PM NULL |
| Protected Test | `servant_standard` · active/ok · cancel false · period end `2026-11-24T07:00:45Z` · `sub_…HboS` |
| SMS Tax Test | available **100** · reserved **0** · auto **disabled** · attempts **6** |
| Sandbox active linkage | Customer **0** · Subscription **0** · Schedule **0** · Latest invoice **0** · Auto PM **0** |

### Retained findings (unchanged)

- UPG-PREVIEW-PERM → Phase **5D-2A.1** (Live createPreview permission) still required before 5D-2B
- Billing-address save can create Live Customer while Checkout fail-closed
- Paid invoice `amount_due` retention semantics
- Subscription PM finalize idempotency P2
- Subscription Schedule API permission runtime validation before 5D-3
- 3DS / `error_if_incomplete` needs controlled observation
- Minor upgrade confirmation UX (tax line / PM last4) P2/P3

### Next phase

**READY FOR PHASE 5D-2A.1 — LIVE UPGRADE PREVIEW RUNTIME VALIDATION — NON-MUTATING**

One authorized non-mutating Live `invoices.createPreview` on Lifecycle Test only. Still **no** `subscriptions.update`. Upgrade gate stays **false**.

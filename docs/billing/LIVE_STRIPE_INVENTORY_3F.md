# Stripe Live Configuration Inventory (Phase 5C-3F)

Non-secret operational record. **Do not store secret keys or webhook
signing secrets in this file.**

Repository baseline at documentation time: `69474e3` · migration **115**.

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
   (see CONTROLLED SANDBOX→LIVE LINKAGE RESET below). Five other orgs still hold
   Sandbox linkage and must not use Live Checkout until separately remapped.
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
12. Remap remaining five Sandbox-linked orgs before their Live use
13. Invoice createPreview runtime permission check (upgrade path)
14. Downgrade schedule smoke; later SMS auto-replenish Live validation

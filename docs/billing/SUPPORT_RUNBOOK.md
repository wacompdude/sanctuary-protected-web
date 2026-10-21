# Billing Support Runbook (Phase 5C-3E-1)

Internal operations guide for initial Live billing support.
Customer-facing rules: `/billing`. Refunds follow D-02–D-05.

| Scenario | Customer action | Support action | Stripe Dashboard | Sanctuary Protected | Preserve | Escalate when |
|----------|-----------------|----------------|------------------|---------------------|----------|---------------|
| Subscription payment failed | Update subscription PM in Settings → Billing | Confirm failure notice; guide PM update | Check invoice / Smart Retries | In-app past_due banner; no second retry clock | Invoice id, events | Terminal cancel / access loss |
| Subscription recovery | None if paid | Confirm recovery notice | Confirm invoice paid | Entitlements continue | Payment + invoice ids | Mismatch local vs Stripe |
| Refund request (subscription) | Email billing@ | Apply D-02; law / duplicate / error only | Issue refund if approved | No app refund UI | Charge + org id + reason | High value / unclear law |
| Duplicate charge | Email billing@ | Confirm duplicate | Refund duplicate | Note on billing history if present | Both payment ids | Partial refund tax questions |
| Manual SMS refund request | Email billing@ | Apply D-03; generally no after grant | Refund only if exception | Do not silent reverse consumed credits | PI / Checkout + ledger | Consumed credits dispute |
| Automatic SMS refund request | Email billing@ | Apply D-04 | Same | Same; check attempt row | Attempt + PI + ledger | Cap / tax confusion |
| Invoice request | Settings → Billing history or email | Share hosted invoice URL | Open invoice / PDF | Local billing_transactions | Invoice URL | Missing webhook sync |
| Tax question | Email billing@ | Explain tax may apply by billing/service location where we are required to collect; not legal advice | Tax on invoice / calculation | Address UI; tax attention states | Address + tax amounts | Ongoing nexus/registration compliance (D-09) |
| Card replacement | Settings → Billing (sub and/or SMS PM) | Confirm which PM (subscription vs auto SMS) | Verify attached PM | SetupIntent flows | SetupIntent / PM ids | Wrong PM charged |
| Cancellation | Owner: Cancel at period end | Confirm period-end access | cancel_at_period_end | Local cancel flag via webhook | Period end date | Immediate cancel demand |
| Upgrade | Owner confirms prorated preview | Explain always_invoice preview | Subscription update | Webhook plan sync | Preview + invoice | Preview vs charged mismatch |
| Downgrade | Owner confirms schedule | Explain next renewal; no refund proration | Subscription schedule | Entitlements until release | Schedule id | Campus / user over-limit |
| SMS credit discrepancy | Describe expected vs shown | Compare ledger + balances | Charges for packages | Admin adjustment only if authorized + audited | Ledger rows | Suspected fraud |
| Dispute / chargeback | Prefer contact us first | Follow DISPUTE_RUNBOOK.md | Evidence workflow | No auto delete / revoke | All financial + ledger | Lost dispute / legal claim |

## Contacts

- Billing: billing@sanctuaryprotected.com
- Support: support@sanctuaryprotected.com
- Public mailing address: see `lib/legal/config.ts` (D-10)

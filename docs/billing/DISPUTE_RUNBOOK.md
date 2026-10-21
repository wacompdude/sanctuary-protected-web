# Stripe Dispute / Chargeback Runbook (Phase 5C-3E-1 / D-15)

Automated dispute webhooks are **deferred** (POST-LAUNCH HARDENING).
Initial Live operations use the Stripe Dashboard.

A dispute must **not** automatically:

- delete an organization
- delete financial history
- remove SMS ledger history
- silently revoke access

## Procedure

1. **Detect** — Stripe Dashboard → Payments / Disputes (or email from Stripe).
2. **Identify** — Match charge / PaymentIntent / invoice to Organization
   (`billing_customer_id`, invoice id, payment id, organization id in metadata).
3. **Preserve evidence** — Download Stripe evidence package; keep timestamps.
4. **Preserve local records** — Do not delete `billing_transactions`,
   subscription rows, replenishment attempts, or SMS credit ledger entries.
5. **Review subscription state** — active / past_due / canceled; note
   cancel_at_period_end.
6. **Review SMS credits** — If the dispute covers an SMS package or automatic
   replenishment, note granted vs consumed credits. Do **not** silently reverse
   consumed credits.
7. **Communicate** — Prefer resolving with the customer via
   `billing@sanctuaryprotected.com` before the card-issuer deadline when
   possible.
8. **Submit evidence** — Stripe Dashboard before the evidence deadline.
9. **Record outcome** — Won / lost / accepted; notify accounting; keep notes
   with organization id and Stripe dispute id.
10. **Access** — Do not revoke access solely because a dispute exists unless
    a separate business decision (fraud / abuse) is made and documented.

## Escalation

- Accounting for remittance / revenue adjustments
- Legal for disputed contract claims
- Platform admin only for explicit, audited credit adjustments

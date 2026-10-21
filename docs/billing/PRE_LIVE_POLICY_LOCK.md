# Pre-Live Billing Policy Lock (Phase 5C-3E-1)

Owner-approved decisions recorded for Live preparation. This document is
internal. Customer-facing language lives in `/billing` (Billing Policy).

| ID | Topic | Status |
|----|-------|--------|
| D-01 | 7-day no-card local trial; no auto-convert; no auto-charge | Approved — copy aligned |
| D-02 | Subscription fees generally non-refundable once billed (law / duplicate / billing error) | Approved — copy aligned |
| D-03 | Manual SMS packages non-refundable after grant (same exceptions) | Approved — copy aligned |
| D-04 | Automatic SMS replenishment same refund rule | Approved — copy aligned |
| D-05 | Purchased SMS: no cash value; survive normal cancellation | Approved — copy aligned |
| D-06 | Stripe is retry authority; past_due keeps entitlement; terminal unpaid/canceled may restrict | Approved — copy aligned |
| D-07 | Collect applicable tax via Stripe Tax + billing location (application intent) | Approved — copy aligned |
| D-08 | Candidate tax code `txcd_10103001` (not legally certified) | Approved — documented |
| D-09 | Nexus / registration / remittance | **ACCOUNTING/TAX EXTERNAL ACTION REQUIRED** |
| D-10 | Public mailing address (Spokane WA) | Approved — configured |
| D-11 | Governing state / venue | **LEGAL REVIEW REQUIRED** (still null) |
| D-12 | Block/package SMS only; no open-ended overage | Approved — copy aligned |
| D-13 | Monthly-only Live launch; annual deferred | Approved — copy aligned |
| D-14 | Customer Portal not enabled for initial Live | Approved — documented |
| D-15 | Dispute webhook automation deferred; Dashboard runbook | Approved — runbook |

## Distinctions

- **Business origin (Washington)** is not governing law.
- **Tax calculation** is not tax registration.
- **Safe to create Live Stripe catalog/webhook/key** does not mean safe to
  install Production Live credentials or accept the first real payment.

See also:

- [TAX_READINESS.md](./TAX_READINESS.md)
- [DISPUTE_RUNBOOK.md](./DISPUTE_RUNBOOK.md)
- [SUPPORT_RUNBOOK.md](./SUPPORT_RUNBOOK.md)

# Application SMS accounting

This is the authoritative behavior for organization application SMS. It was proven by the local PostgreSQL suite and by one controlled live Servant send. MFA and login SMS are a separate system.

## Plans

SMS capability and the included monthly allowance are different features.

| Plan | Application SMS | Included segments / month | Purchased package |
| --- | --- | --- | --- |
| Servant Standard | Enabled | 0 | 50 segments / $5 |
| Steward Pro | Enabled | 250 | 100 segments / $10 |
| Shepherd Plus | Enabled | 500 | 200 segments / $20 |
| Omni Enterprise | Enabled | 1000 | 500 segments / $40 |

Servant Standard can send application SMS. It has no included monthly segments. Purchased credits are the capacity source when the included allowance is 0.

## Funding order

Included monthly capacity is used first. Purchased capacity is used only after included capacity for the current period is exhausted.

A multi-segment message may be split between included and purchased segments. The full requested count must be available before a send. There is no partial funding and no partial send.

## Reservation

Capacity is reserved atomically before the provider send. A purchased balance does not decrease when it is reserved. Purchased reserved increases by the purchased portion. Included reserved increases by the included portion.

## Provider acceptance

The Bird provider message id is stored before final accounting settlement. After Bird accepts the message, the reservation is committed:

- purchased balance decreases by the purchased segment count
- purchased reserved returns to zero
- included reserved moves into included usage

## Provider rejection

An explicit provider rejection before acceptance releases the reservation. No included or purchased credit is consumed.

## After acceptance

Once Bird has accepted the message, a later failed, undelivered, or expired handset or carrier status does not restore the credit.

## Unknown provider outcome

If `send_started_at` is set and `provider_message_id` is absent:

- do not send again
- do not commit capacity
- do not release capacity because of age

That state needs reconciliation or manual investigation.

## Accepted, but settlement failed

If `provider_message_id` is present and the commit did not finish:

- keep the reservation
- keep the provider message id
- do not call Bird again
- finish through commit-only reconciliation

Commit-only reconciliation commits the existing allocation. It does not send again and does not create a second consume.

## Idempotency

There is one allocation per organization and delivery.

- A duplicate reserve does not create a second hold.
- A duplicate commit does not consume twice.
- A duplicate release does not release twice.
- Reserving again after a release reuses the allocation and increments its generation.

## Concurrency

Capacity changes for one organization are serialized with `pg_advisory_xact_lock`. The local PostgreSQL suite used two independent database sessions and showed that concurrent requests cannot overspend purchased capacity or a combined included-plus-purchased balance.

## Purchased credit lifetime

Purchased credits belong to the organization. They do not reset at the billing period boundary. They survive a plan change. They remain while the subscription is cancelled or otherwise ineligible, and they can be used again when the subscription is eligible. This document does not assign an expiration to purchased credits.

## Consent

Application SMS consent is separate from MFA and login SMS. Storing a phone number does not opt the person into application SMS. A STOP suppression blocks application SMS eligibility. MFA SMS remains a platform authentication function.

## Phase 4 live validation

A controlled Servant Standard organization with an included limit of 0 and a purchased balance of 50 sent one real 1-segment application SMS through the normal composer.

The allocation was included 0 and purchased 1. Bird was called once. The allocation committed. The purchased balance ended at 49. Included usage stayed 0. One consume of -1 was recorded. The delivery webhook arrived and the delivery status was delivered. There was no duplicate send and no duplicate consume.

## Local PostgreSQL regression suite

`scripts/sms-capacity-phase4b.local.mjs` calls the installed migration-106 functions on a PostgreSQL cluster that the script itself starts.

Run it only as an explicit developer command:

```
PHASE4B_MODULE_ROOT=<directory outside this repo> npm run selfcheck:sms:postgres
```

`PHASE4B_MODULE_ROOT` must point at a directory that contains `pg` and `embedded-postgres`, and it must not be inside this repository. The script binds `127.0.0.1` port `55432` and uses the database `sms_phase4b`. Those values are fixed in the script. Do not set `DATABASE_URL`, `SUPABASE_DB_URL`, or `PGHOST` for this command.

Before it changes data, the script reads `inet_server_addr()` and `current_database()` and stops unless the server is loopback and the database is `sms_phase4b`. It also stops if the environment or server identity refers to Supabase hosting or the production project. It does not use production credentials.

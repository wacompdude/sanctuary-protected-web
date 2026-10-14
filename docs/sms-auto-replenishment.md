# Application SMS auto-replenishment

Automatic replenishment buys the current plan’s existing SMS package when total available application SMS capacity is low. It is off unless an owner or co-owner explicitly authorizes it. Phase 5B stores that authorization, claims one attempt, and can record a paid grant. It does not call Stripe or Bird, and it does not send SMS.

## Opt-in

A missing configuration row means off. `disabled` means off. The legacy column `organization_sms_credit_balances.auto_replenish_enabled` was created with default `true`. That value is not consent. Migration 110 sets the default to false and sets every existing row to false. Application code must not charge because that column is true.

`billing_extra_items.auto_purchase_allowed` means the catalog item can be used by a future automatic purchase. It is not organization consent.

Only an active organization `owner` or `co_owner` may enable, disable, resume, change the threshold, change the spending cap, or re-authorize. An administrator can view billing and cannot manage replenishment.

Enabling requires an active subscription, application SMS entitlement, a valid threshold, a spending cap that can buy at least one current package and is at most $500 in the subscription period, authorization text version `sms_auto_replenishment_v1`, and a Stripe payment-method id. Phase 5B does not create that payment method. No production organization is enabled by the migration.

The authorization concept is: the owner or co-owner authorizes Sanctuary Protected LLC to charge the saved payment method for the current plan’s SMS package when total available application SMS capacity is at or below the selected threshold, up to the selected period cap. A package price increase requires a new authorization.

## Capacity trigger

Total available application SMS capacity is included available plus purchased available.

Included available is `GREATEST(0, monthly limit - used - reserved)`. Purchased available is `balance - reserved`, or zero when the organization has no purchased-balance row. The claim reads these inside the database. It does not trust a caller-supplied balance.

Steward with 200 included segments and no purchased credits does not qualify at a threshold of 20. Servant with 0 included and 9 purchased credits does qualify at a threshold of 10 when every other rule passes.

The threshold is an integer from 1 through one less than the current package size. Catalog defaults are Servant 10, Steward 20, Shepherd 40, and Omni 100. Those defaults live in the commercial catalog, not in a second price list.

## Package and price

The package is the current plan’s default SMS block in `billing_plan_extra_items` and its current price. Servant is 50 segments / $5, Steward 100 / $10, Shepherd 200 / $20, and Omni 500 / $40.

The configuration stores the package price that was authorized. If the current package price is higher, the claim moves the configuration to `authorization_review_required` and does not create an attempt. The same or a lower price stays authorized. A Steward authorization at $10 still covers a later Servant package at $5. A Servant authorization at $5 does not cover a later Steward package at $10 until the owner or co-owner re-authorizes.

Purchased credits stay on the organization across plan changes. Included usage is unchanged by an automatic grant.

## Spending cap

The cap is `max_auto_spend_cents` for the current `organization_subscriptions` period. It applies only to succeeded automatic attempts in that period, counting package amount plus stored tax, plus any open attempt amount, plus the proposed package price. Landing exactly on the cap is allowed. The next package that would pass the cap is not claimed. The configuration stays `enabled`. The next subscription period can qualify again without a new enable.

Manual SMS purchases use ledger reason `manual_purchase` and are not replenishment attempts, so they do not count. A manual purchase also does not resume automatic charging after a payment failure.

## Single flight

At most one attempt in `claimed`, `charging`, or `payment_pending` may exist for an organization. The claim takes `application_sms_capacity_lock` only for that short transaction. A later worker must call Stripe after the transaction commits. The database lock is not held during Stripe HTTP.

The grant idempotency key is `sms:auto:{attemptId}`. The future Stripe idempotency key is stored as `sms_auto_pi_{attemptId}`.

## Grant

`record_automatic_application_sms_replenishment` runs only after a trusted payment success. It writes one `sms_block` transaction described as “Automatic SMS credit replenishment” and one ledger row with reason `auto_replenish`. Package amount and tax are stored separately. Tax may be zero. Stripe Tax is not implemented in Phase 5B. An exact replay does not credit again. A conflicting payment id or amount returns `idempotency_mismatch` or `reconciliation_required` and does not invent a repair.

## Payment failure and subscription status

Automatic charging is allowed only while the subscription status is `active`. Trialing, past due, grace period, incomplete, cancelled, expired, and suspended do not qualify. A trial cannot enable replenishment. This does not change who may send application SMS.

A future failed payment adds no credits and moves configuration to `payment_attention_required`. Further claims stop until an owner or co-owner resumes. Returning to `active` after cancellation does not by itself resume charging.

## Sends, consent, and later work

If a message does not fit in current capacity, Phase 4 still blocks it before Bird. Version 1 does not hold that message for Stripe and does not retry it because replenishment finished.

Recipient SMS consent is separate. Authorization to buy credits does not opt anyone into SMS. MFA and login SMS are not part of this capacity, threshold, or cap.

Refunds and disputes are not handled here. Consumed automatic credits are not reversed automatically. That remains later policy and engineering work.

Phase 5C is the off-session Stripe setup, PaymentIntent, and webhook. Phase 5B does not call Stripe or Bird.

## Payment-method setup

Phase 5C-1 saves a payment method with a SetupIntent. It does not create a PaymentIntent or enable replenishment.

The server creates the SetupIntent for the canonical Stripe customer in `organization_billing_profiles.provider_customer_id`, with `usage` set to `off_session` and `allowed_payment_method_types` limited to `card`. Stripe’s Payment Element shows Apple Pay and Google Pay when card payments are enabled and the browser qualifies. Those wallets produce a PaymentMethod whose type remains `card`, so they can be saved. Bank debit, Cash App, Klarna, Amazon Pay, and other non-card types are rejected.

The browser may return only the SetupIntent id. The server retrieves the SetupIntent and PaymentMethod from Stripe and checks the customer, organization metadata, purpose `sms_auto_replenishment_payment_setup`, succeeded status, off-session usage, and card type. Only `pm_…` is stored. Brand, last4, and expiration are read from Stripe for display and are not written to the database. No full card number, CVC, or raw Stripe object is stored.

The idempotency key is `sms_auto_pm_setup_v1_{organizationId}_{currentPaymentMethodId or none}`. A repeated click reuses that SetupIntent. Saving a different method changes the key. No `setup_intent.succeeded` webhook is required: completion calls the server, which retrieves the SetupIntent. If the browser closes first, the same key returns the succeeded SetupIntent and the server can verify it then.

`record_application_sms_replenishment_payment_method` writes a disabled configuration when none exists and appends `payment_method_changed`. It does not enable charging. Removing the reference clears `payment_method_id` and does not detach the Stripe PaymentMethod. If the configuration was enabled, removal moves it to `payment_attention_required`.

## Off-session payment

Phase 5C-2 can create one off-session PaymentIntent for an attempt that is already `claimed`. It does not claim from the SMS send path and it does not enable replenishment.

`begin_application_sms_replenishment_charge` rechecks the active subscription, enabled configuration, saved card, catalog amount, authorization price, and spending cap. It snapshots `pm_…` and moves the attempt to `charging`. A disabled configuration cancels a still-claimed attempt. The Stripe idempotency key is the attempt’s existing `provider_idempotency_key`, `sms_auto_pi_{attempt id}`.

The PaymentIntent uses the snapshotted amount, `usd`, the canonical customer, that card, `off_session`, and `confirm`. `allowed_payment_method_types` is `card`. A synchronous `succeeded` response only stores the PaymentIntent id and leaves the attempt `payment_pending`. Credits are granted only by a signature-verified `payment_intent.succeeded` webhook calling `record_automatic_application_sms_replenishment`. A declined card or a PaymentIntent that needs the customer marks the attempt failed and, when the configuration is still enabled, moves it to `payment_attention_required`. A timeout leaves the attempt `charging` so the same idempotency key can be retried. No production tax calculation is attached to this PaymentIntent yet, so a live automatic charge is not authorized.

The existing webhook destination must include `payment_intent.succeeded` and `payment_intent.payment_failed`. Other PaymentIntents, including manual SMS Checkout, are ignored unless `sanctuary_purpose` is `sms_auto_replenishment`. A paid attempt can still be granted if the organization disables replenishment after the PaymentIntent exists.

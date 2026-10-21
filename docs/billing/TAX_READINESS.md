# Tax Readiness (Phase 5C-3E-2)

Internal documentation. Not legal or accounting advice.

## Status

**BUSINESS TAX POLICY APPROVED — ONGOING TAX/NEXUS COMPLIANCE REQUIRED**

| Layer | Status |
|-------|--------|
| Business tax operating policy (D-09) | **Resolved business decision** |
| Nexus monitoring, registrations, filings, remittance | **Ongoing external compliance** |
| Candidate product tax code `txcd_10103001` (D-08) | Candidate pending accounting confirmation |
| Governing state (D-11) | **Washington** (Terms); exclusive venue intentionally unspecified |

## Business / application origin

- Legal entity: Unified Protective Technologies LLC
- Customer-facing brand: Sanctuary Protected LLC
- Application / business operations origin: **Washington State, United States**
- Public mailing address (D-10):

  522 W Riverside Ave Ste N  
  Spokane, WA 99201-0581  
  United States

## Tax operating policy (D-09)

1. Collect applicable sales/use tax where the business is required and
   appropriately configured/registered to collect it.
2. **Stripe Tax** is the tax **calculation** technology.
3. Calculations use the customer’s applicable destination / billing /
   service location (country, state/province, postal/ZIP, and related
   billing-address fields as required by Stripe Tax).
4. **Washington customers:** applicable Washington sales tax should use
   the customer’s destination/location — **not** merely the company’s
   Spokane mailing address.
5. **Out-of-state customers:** must **not** automatically be charged
   Washington sales tax solely because Sanctuary Protected is operated
   from Washington.
6. **Other U.S. jurisdictions:** collect only when Unified Protective
   Technologies LLC has the applicable obligation and
   registration/configuration to collect there.
7. Economic and physical nexus must be **monitored as the business grows**.
8. Do **not** hard-code a universal national economic-nexus dollar or
   transaction threshold into application business logic; jurisdictional
   rules differ and change.
9. Crossing an applicable jurisdiction’s nexus/registration threshold
   should trigger **compliance review / registration / configuration**,
   not silent invention of a legal obligation in application code.
10. Stripe Tax may assist with calculation and monitoring; **Stripe does
    not determine** the company’s legal nexus or registration obligation.
11. Washington reporting, B&O classification/apportionment, tax
    registrations, and jurisdiction-specific filing/remittance remain
    **accounting/tax compliance** responsibilities.
12. Exact tax treatment/classification of subscription revenue and
    SMS-credit package revenue remains documented for accounting/tax
    confirmation where required.

## Stripe Live configuration principle (Phase 3F — do not execute here)

**Stripe Tax monitoring/capability ≠ Stripe Tax registration/collection authorization.**

During Live Stripe Tax setup:

- Do **not** enable registrations for all U.S. states by default.
- Registrations should correspond to jurisdictions where the business is
  actually registered / authorized / required to collect.
- **Washington** should be specifically reviewed as the initial home-state
  tax jurisdiction.
- Other jurisdictions are added as compliance determinations require.

This phase does **not** create Stripe Tax registrations or Live objects.

## Candidate Stripe tax code (D-08)

- Current candidate: **`txcd_10103001`**
- SaaS / business-use candidate in Sandbox catalog documentation.
- **Not** legally or accountingly certified solely because it appears in
  Sandbox.
- Do not change without accounting review.

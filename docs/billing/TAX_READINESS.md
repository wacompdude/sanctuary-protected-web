# Tax Readiness (Phase 5C-3E-1)

Internal documentation. Not legal or accounting advice.

## Application intent (D-07)

Sanctuary Protected intends to calculate and collect applicable sales/use tax
on subscription and Application SMS package charges where tax collection is
configured in the application (Stripe Tax gates) using the Organization’s
billing address / location information:

- country
- state / province
- postal / ZIP code
- other address fields required by Stripe Tax

Customer-facing policy describes this as tax that **may** be calculated and
added based on billing location. It does **not** claim tax is collected in
every jurisdiction, and it does **not** claim Stripe determines legal nexus.

## Business / application origin

- Legal entity: Unified Protective Technologies LLC
- Customer-facing brand: Sanctuary Protected LLC
- Application / business operations origin: **Washington State, United States**
- Public mailing address (D-10):

  522 W Riverside Ave Ste N  
  Spokane, WA 99201-0581  
  United States

Washington origin is **not** the same as governing law (D-11 remains
LEGAL REVIEW REQUIRED).

## Candidate Stripe tax code (D-08)

- Current candidate product tax code: **`txcd_10103001`**
- Used in Sandbox catalog / SMS tax documentation as SaaS / business-use
  candidate.
- **Not** legally or accountingly certified solely because it appears in
  Sandbox.
- Do not change this code in application or Stripe without accounting review.

## External determination still required (D-09)

An accountant or tax professional must determine before first real payment
where tax collection is required:

- economic and physical nexus
- required jurisdictions and registrations
- collection and remittance obligations
- Washington requirements
- other U.S. states as applicable
- Canada / international when applicable

**ACCOUNTING/TAX EXTERNAL ACTION REQUIRED BEFORE FIRST REAL PAYMENT WHERE TAX COLLECTION IS REQUIRED.**

Do not enable or disable tax collection as a workaround for unresolved
registration obligations.

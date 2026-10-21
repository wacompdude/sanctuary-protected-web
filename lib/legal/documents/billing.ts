import {
  BILLING_CONTACT_EMAIL,
  LEGAL_ROUTES,
  POLICY_DATES,
  POLICY_VERSIONS,
  PRODUCT_NAME,
  SUPPORT_EMAIL,
  brandIdentityLine,
  mailingAddressDisplay,
  operatorLabel,
} from "@/lib/legal/config";
import { PLAN_DISPLAY_NAMES } from "@/lib/subscriptions/plan-keys";
import type { LegalDocument } from "@/lib/legal/types";

const operator = operatorLabel();
const planList = Object.values(PLAN_DISPLAY_NAMES).join(", ");

export const BILLING_DOCUMENT: LegalDocument = {
  slug: "billing",
  title: "Billing, Subscription, Cancellation & Refund Policy",
  metaTitle: "Sanctuary Protected Billing & Subscription Policy",
  metaDescription:
    "How Sanctuary Protected subscriptions, plan changes, cancellation, Text/SMS limits, and billing inquiries work.",
  version: POLICY_VERSIONS.billing,
  effectiveDate: POLICY_DATES.billingEffective,
  lastUpdated: POLICY_DATES.billingUpdated,
  intro: `This Billing, Subscription, Cancellation & Refund Policy (“Billing Policy”) explains how paid access to ${PRODUCT_NAME} works. ${brandIdentityLine()} It applies to Organizations that subscribe. Individual Users are billed through their Organization, not through personal consumer checkout, unless we expressly offer a different product. This Policy should be read with the Terms of Service (${LEGAL_ROUTES.terms}) and Privacy Policy (${LEGAL_ROUTES.privacy}).`,
  sections: [
    {
      id: "overview",
      title: "1. Overview",
      blocks: [
        {
          type: "p",
          text: `Certain ${PRODUCT_NAME} features require a Subscription plan assigned to the Organization. Plan entitlements (which modules and limits apply) operate even when a card processor is not connected. When a payment processor is connected, Owners use Settings → Billing in ${PRODUCT_NAME} to manage checkout, payment methods, plan changes, and cancellation. We do not currently offer a third-party customer billing portal for the initial Live launch.`,
        },
      ],
    },
    {
      id: "plans",
      title: "2. Subscription Plans",
      blocks: [
        {
          type: "p",
          text: `Current plan names in the product are: ${planList}. Compare features on the in-app plans and billing screens after you sign in. Those screens, not this Policy, are the source for prices, included modules, User limits, campus limits, and Text/SMS allowances in effect for your Organization.`,
        },
      ],
    },
    {
      id: "intervals",
      title: "3. Monthly Billing",
      blocks: [
        {
          type: "p",
          text: "Initial Live subscription checkout offers monthly plan pricing only. Annual billing is not offered at this time. If we later enable annual billing, the price, term, and renewal date will be shown before you pay.",
        },
      ],
    },
    {
      id: "renewal",
      title: "4. Automatic Renewal",
      attorneyReview: "automatic renewal compliance",
      blocks: [
        {
          type: "p",
          text: "When a payment processor is connected and you complete checkout for a paid Subscription, you authorize recurring monthly charges to the payment method on file for each renewal period until you cancel. Renewal terms, including the amount and period, will be presented at checkout. If no processor is connected, plan changes are applied in-product without charging a card through the Service.",
        },
      ],
    },
    {
      id: "payment-methods",
      title: "5. Payment Methods",
      blocks: [
        {
          type: "p",
          text: `${operator} does not store credit-card numbers in the ${PRODUCT_NAME} application. If checkout is enabled, a third-party processor will collect payment details on its pages. Accepted methods are those the processor displays. Subscription billing and optional automatic Application SMS replenishment use separate payment-method authorizations in Settings → Billing.`,
        },
      ],
    },
    {
      id: "failed-payments",
      title: "6. Failed Payments",
      blocks: [
        {
          type: "p",
          text: "If a paid Subscription renewal payment fails after a processor is connected, we notify billing contacts (owners and co-owners) and you may update the subscription payment method in Settings → Billing. The payment processor may automatically retry the charge according to its configured payment-recovery settings. Exact retry timing depends on those settings and is not a fixed number of days published in this Policy.",
        },
        {
          type: "p",
          text: "While the processor reports the Subscription as past due, paid plan entitlements generally continue. If the outstanding payment cannot be recovered and the processor reaches a terminal unpaid or canceled state, paid access may be restricted or the Subscription may be canceled. Restoration may require bringing the account current and completing a new paid checkout where required.",
        },
      ],
    },
    {
      id: "pricing-changes",
      title: "7. Pricing Changes",
      blocks: [
        {
          type: "p",
          text: "We may change prices or plan packaging. Changes apply going forward. If you are on an automatic-renewal Subscription, we will provide notice as required by law or the processor’s flow before the new amount is charged, unless the change is required by tax or a third-party fee we pass through.",
        },
      ],
    },
    {
      id: "taxes",
      title: "8. Taxes",
      blocks: [
        {
          type: "p",
          text: "Applicable taxes may be calculated and added based on your billing or service location and the jurisdictions in which we are required to collect tax. Location information may include country, state or province, and postal or ZIP code as used by our payment processor’s tax tools. Tax calculation is separate from tax registration. We do not charge tax in a jurisdiction merely because our business is operated from Washington, and we do not claim to collect tax in every jurisdiction.",
        },
      ],
    },
    {
      id: "upgrades",
      title: "9. Upgrades",
      blocks: [
        {
          type: "p",
          text: "Moving to a higher plan through Settings → Billing takes effect when the processor accepts the change. When a payment processor is connected, the product shows a prorated amount due today before you confirm. The processor applies credit for unused time on your current plan and invoices the prorated difference for the remainder of the current period. New plan entitlements apply after the processor reports the updated subscription. Do not assume a different amount than the preview you confirm.",
        },
      ],
    },
    {
      id: "downgrades",
      title: "10. Downgrades",
      blocks: [
        {
          type: "p",
          text: "A downgrade may reduce modules, active-User limits, campus limits, photo limits, or Text/SMS allowances. The product is designed to keep existing records; some writes may be blocked if you exceed the new plan. Owners receive an in-app impact preview and must confirm. When a payment processor is connected, a confirmed downgrade is scheduled for the next renewal (period end). Your current plan and its entitlements continue until that renewal. The product does not issue a prorated refund for the unused portion of the higher plan when scheduling a downgrade.",
        },
      ],
    },
    {
      id: "cancellation",
      title: "11. Cancellation",
      blocks: [
        {
          type: "p",
          text: "Organization owners can request cancellation from Settings → Billing using “Cancel at period end.” That request is designed to stop renewal while leaving Organization data, campuses, inventory, and history in place. Access to paid features continues until the end of the current paid period when a period end exists; if there is no processor period, follow the confirmation message shown in the product. Other roles cannot cancel Subscriptions in the current billing UI. Cancellation does not itself create a refund.",
        },
      ],
    },
    {
      id: "refunds",
      title: "12. Refunds",
      attorneyReview: "refund policy",
      blocks: [
        {
          type: "p",
          text: "Except where required by applicable law, subscription fees are generally non-refundable once billed. We will also correct duplicate charges and confirmed billing or processing errors.",
        },
        {
          type: "p",
          text: "Except where required by applicable law, manual Application SMS credit package purchases are generally non-refundable after credits have been granted. The same rule applies to automatic Application SMS replenishment purchases after credits have been granted. Exceptions include duplicate charges and confirmed billing or processing errors. Consumed SMS credits are not silently reversed when a refund is considered.",
        },
        {
          type: "p",
          text: "Purchased Application SMS credits have no cash redemption value and are not normally refundable merely because they remain unused. Purchased credits generally survive normal subscription cancellation while the Organization account and data remain retained under applicable account and data-retention rules. Treatment upon permanent Organization deletion or final data deletion follows those retention rules and is not a cash refund.",
        },
        {
          type: "p",
          text: `To request review of a charge, email ${BILLING_CONTACT_EMAIL} (or ${SUPPORT_EMAIL}) with your Organization name and the date of the charge. Initial refunds, when approved under this Policy, may be processed operationally through the payment processor. Card-issuer chargebacks are addressed in Section 19.`,
        },
      ],
    },
    {
      id: "trials",
      title: "13. Free Trials",
      blocks: [
        {
          type: "p",
          text: `New Organizations may receive a 7-day trial of plan entitlements without providing a credit or debit card. This trial is recorded in ${PRODUCT_NAME}; it is not a payment-processor subscription trial and does not create a paid processor subscription by itself.`,
        },
        {
          type: "p",
          text: "The trial does not automatically convert to a paid Subscription and does not automatically charge a card when the trial ends. To continue with paid service after the trial, an Owner must explicitly select a paid plan and complete checkout with the payment processor. Recurring paid billing begins only after that explicit checkout authorization.",
        },
      ],
    },
    {
      id: "promotions",
      title: "14. Promotional Offers",
      blocks: [
        {
          type: "p",
          text: "If we offer promotional pricing, eligibility and duration will appear with that offer. Promotions may end or be limited. Unless stated otherwise, a promotion does not change this Billing Policy.",
        },
      ],
    },
    {
      id: "sms",
      title: "15. Text/SMS Usage and Additional Credits",
      blocks: [
        {
          type: "p",
          text: "Text/SMS for operational notifications is plan-gated. Included monthly Application SMS recipient allowances in the current commercial catalog and entitlement matrix are: none on Servant Standard, 250 on Steward Pro, 500 on Shepherd Plus, and 1,000 on Omni Enterprise. Each recipient of a text counts as one SMS toward that allowance.",
        },
        {
          type: "p",
          text: "We do not use open-ended, per-message metered SMS overage billing. Additional Application SMS capacity is purchased only through defined credit packages for your plan (for example, Servant Standard: 50 credits for $5; Steward Pro: 100 for $10; Shepherd Plus: 200 for $20; Omni Enterprise: 500 for $40), plus applicable tax. Optional automatic replenishment, when an Owner or co-owner enables it, purchases those same defined packages according to the selected threshold, spending cap, and tax rules—not an open-ended per-message rate.",
        },
        {
          type: "p",
          text: "When included and purchased credits are exhausted, additional Application SMS sending is blocked until more credits are available. Login verification texts, when used, follow Account security settings and are separate from Organization Application SMS allowances.",
        },
      ],
    },
    {
      id: "suspension",
      title: "16. Account Suspension for Nonpayment",
      blocks: [
        {
          type: "p",
          text: "While a paid Subscription is past due and the payment processor is still attempting recovery, paid entitlements generally continue. If payment cannot be recovered and the processor reports a terminal unpaid or canceled state, we may restrict paid features. Restriction is intended to limit use, not to wipe Organization records. Restoration may require bringing the account current.",
        },
      ],
    },
    {
      id: "data-after",
      title: "17. Data Following Cancellation",
      blocks: [
        {
          type: "p",
          text: "Cancellation at period end is designed to preserve Customer Content, including purchased Application SMS credit balances while the Organization remains retained. We do not promise indefinite retention after an Organization is closed or a relationship ends. Export options in the product are limited; do not assume a full data dump is available. The Privacy Policy describes deletion and retention in more detail.",
        },
      ],
    },
    {
      id: "disputes",
      title: "18. Billing Disputes",
      blocks: [
        {
          type: "p",
          text: `Send billing questions to ${BILLING_CONTACT_EMAIL}. You may also contact ${SUPPORT_EMAIL}. Include your Organization name and the date of the charge. We will review in good faith.`,
        },
        {
          type: "p",
          text: `Mailing address: ${mailingAddressDisplay()}`,
        },
      ],
    },
    {
      id: "chargebacks",
      title: "19. Chargebacks",
      blocks: [
        {
          type: "p",
          text: "If you dispute a charge with your card issuer, we (or the processor) may share information reasonably needed to respond. Please contact us first so we can try to resolve the issue. A chargeback is not the same as a refund request under Section 12. Repeated chargebacks after valid use of the Service may result in suspension. This section is not a threat; it describes a normal commercial process.",
        },
      ],
    },
    {
      id: "changes",
      title: "20. Changes to This Billing Policy",
      blocks: [
        {
          type: "p",
          text: "We may update this Billing Policy. The effective date, last-updated date, and version will change. Material changes that affect automatic renewal or cancellation may be communicated through the Service, email, or checkout, as applicable.",
        },
      ],
    },
  ],
};

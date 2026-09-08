import {
  BILLING_CONTACT_EMAIL,
  LEGAL_ROUTES,
  POLICY_DATES,
  POLICY_VERSIONS,
  PRODUCT_NAME,
  SUPPORT_EMAIL,
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
  intro: `This Billing, Subscription, Cancellation & Refund Policy (“Billing Policy”) explains how paid access to ${PRODUCT_NAME} works. It applies to Organizations that subscribe. Individual Users are billed through their Organization, not through personal consumer checkout, unless we expressly offer a different product. This Policy should be read with the Terms of Service (${LEGAL_ROUTES.terms}) and Privacy Policy (${LEGAL_ROUTES.privacy}).`,
  sections: [
    {
      id: "overview",
      title: "1. Overview",
      blocks: [
        {
          type: "p",
          text: `Certain ${PRODUCT_NAME} features require a Subscription plan assigned to the Organization. Plan entitlements (which modules and limits apply) operate even when a card processor is not connected. Checkout, customer portal, and automatic card charges are available only if we have connected a payment provider for your Organization.`,
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
      title: "3. Monthly and Annual Billing",
      blocks: [
        {
          type: "p",
          text: "The product catalog currently presents monthly plan pricing. The billing system can store a yearly interval, but annual checkout is not generally offered in the current billing screens. If we enable annual billing, the price, term, and renewal date will be shown before you pay.",
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
          text: "When a payment processor is connected and you complete checkout, you authorize recurring charges to the payment method on file for each renewal period until you cancel. Renewal terms, including the amount and period, will be presented at checkout. If no processor is connected, plan changes are applied in-product without charging a card through the Service.",
        },
      ],
    },
    {
      id: "payment-methods",
      title: "5. Payment Methods",
      blocks: [
        {
          type: "p",
          text: `${operator} does not store credit-card numbers in the ${PRODUCT_NAME} application. If checkout is enabled, a third-party processor will collect payment details on its pages. Accepted methods are those the processor displays. Until a processor is connected, Owners may still assign plans in billing settings without card capture.`,
        },
      ],
    },
    {
      id: "failed-payments",
      title: "6. Failed Payments",
      blocks: [
        {
          type: "p",
          text: "The application can record subscription statuses that include past due and grace period when a processor reports them. Retry schedules, emails, and the length of any grace period are not published as fixed product rules while checkout is unconfigured. If payment fails after a processor is connected, we may notify billing contacts, retry according to the processor, restrict paid features, or cancel after unsuccessful collection. We do not invent a specific number of retry days in this Policy.",
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
          text: "Applicable taxes may be added where required. Tax calculation, if any, will be performed by us or the payment processor at checkout or on the invoice.",
        },
      ],
    },
    {
      id: "upgrades",
      title: "9. Upgrades",
      blocks: [
        {
          type: "p",
          text: "Moving to a higher plan takes effect when the change is applied in billing settings or when processor checkout completes. The product does not currently advertise automatic proration of unused time. If a processor later prorates charges, that amount will appear in the processor’s checkout or invoice. Do not assume a prorated credit unless it is shown to you at the time of the change.",
        },
      ],
    },
    {
      id: "downgrades",
      title: "10. Downgrades",
      blocks: [
        {
          type: "p",
          text: "A downgrade may reduce modules, active-User limits, campus limits, photo limits, or Text/SMS allowances. The product is designed to keep existing records; some writes may be blocked if you exceed the new plan. Owners receive an in-app impact preview and must confirm a downgrade. Timing follows the in-app apply action (immediate entitlement change) unless a processor schedules the change for the next cycle and says so at checkout.",
        },
      ],
    },
    {
      id: "cancellation",
      title: "11. Cancellation",
      blocks: [
        {
          type: "p",
          text: "Organization owners can request cancellation from Settings → Billing using “Cancel at period end.” That request is designed to stop renewal while leaving church data, campuses, inventory, and history in place. Access to paid features continues until the end of the current paid period when a period end exists; if there is no processor period, follow the confirmation message shown in the product. Other roles cannot cancel Subscriptions in the current billing UI.",
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
          text: "A final refund schedule has not been adopted as a published company policy.",
        },
        {
          type: "placeholder",
          text: "[BUSINESS/LEGAL DECISION REQUIRED — REFUND POLICY]",
        },
        {
          type: "p",
          text: "Until that decision is published, we will honor refunds required by applicable law. For other requests, email the billing contact below. Chargebacks are addressed in Section 19.",
        },
      ],
    },
    {
      id: "trials",
      title: "13. Free Trials",
      blocks: [
        {
          type: "p",
          text: "The billing data model can record a trialing status, but the public product does not currently advertise a self-serve trial with a stated duration. If we grant your Organization a trial, the length, conversion to a paid plan, and any payment timing will be described when the trial is offered. If you are not on a trial, this section does not apply.",
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
      title: "15. Text/SMS Usage and Overages",
      blocks: [
        {
          type: "p",
          text: "Text/SMS for operational notifications is plan-gated. Typical included monthly SMS recipient allowances in the current entitlement matrix are none on Servant Standard, 250 on Steward Pro, and 1,000 on Shepherd Plus and Omni Enterprise. Each recipient of a text counts as one SMS. When a limit is reached, additional sending is blocked rather than billed as an overage in the current product. Unused allowance is not described as rolling over.",
        },
        {
          type: "placeholder",
          text: "[BUSINESS DECISION REQUIRED — SMS OVERAGES]",
        },
        {
          type: "p",
          text: "Whether unused SMS allowance resets on a calendar month, whether overages will later be billed, and how carrier pass-through fees are handled have not been published as final business rules. Login verification texts, when used, follow Account security settings and are separate from Organization notification allowances.",
        },
      ],
    },
    {
      id: "suspension",
      title: "16. Account Suspension for Nonpayment",
      blocks: [
        {
          type: "p",
          text: "If a paid Subscription is past due after a processor is connected, we may suspend paid features. Suspension is intended to restrict use, not to wipe Organization records. Restoration may require bringing the account current.",
        },
      ],
    },
    {
      id: "data-after",
      title: "17. Data Following Cancellation",
      blocks: [
        {
          type: "p",
          text: "Cancellation at period end is designed to preserve Customer Content. We do not promise indefinite retention after an Organization is closed or a relationship ends. Export options in the product are limited; do not assume a full data dump is available. The Privacy Policy describes deletion and retention in more detail.",
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
          text: "If you dispute a charge with your card issuer, we (or the processor) may share information reasonably needed to respond. Please contact us first so we can try to resolve the issue. Repeated chargebacks after valid use of the Service may result in suspension. This section is not a threat; it describes a normal commercial process.",
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

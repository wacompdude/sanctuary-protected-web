import {
  BILLING_CONTACT_EMAIL,
  LEGAL_CONTACT_EMAIL,
  LEGAL_ROUTES,
  POLICY_DATES,
  POLICY_VERSIONS,
  PRODUCT_NAME,
  PUBLIC_SITE_HOST,
  SUPPORT_EMAIL,
  mailingAddressDisplay,
  operatorLabel,
} from "@/lib/legal/config";
import type { LegalDocument } from "@/lib/legal/types";

const operator = operatorLabel();

export const TERMS_DOCUMENT: LegalDocument = {
  slug: "terms",
  title: "Terms of Service",
  metaTitle: "Sanctuary Protected Terms of Service",
  metaDescription:
    "Terms governing use of Sanctuary Protected, a SaaS platform for organizational security, incident management, notifications, and preparedness.",
  version: POLICY_VERSIONS.terms,
  effectiveDate: POLICY_DATES.termsEffective,
  lastUpdated: POLICY_DATES.termsUpdated,
  intro: `These Terms of Service (“Terms”) are an agreement between you and ${operator} concerning your access to and use of ${PRODUCT_NAME} (the “Service”). By accessing or using the Service, creating an account, or clicking to accept these Terms, you agree to be bound by them. If you use the Service on behalf of a church, school, nonprofit, business, or other entity, you represent that you have authority to bind that entity, and “you” includes that entity.`,
  sections: [
    {
      id: "introduction",
      title: "1. Introduction and Agreement",
      blocks: [
        {
          type: "p",
          text: `"We,” “us,” and “our” mean ${operator}. “${PRODUCT_NAME},” the “Service,” and the “Platform” mean the hosted software, websites, APIs, documentation, and related features we make available at ${PUBLIC_SITE_HOST} and successor domains. “Organization” means a church, campus network, or other customer tenant created in the Service. “User” means an individual with login credentials. “Account” means a User’s authentication identity. “Content” means information submitted to or generated in the Service, including text, photos, files, notes, and configuration. “Subscription” means a paid or assigned plan that governs feature access for an Organization.`,
        },
        {
          type: "p",
          text: `Individual Users typically access the Service as members of one or more Organizations. The Organization that subscribes for the Service is responsible for its Users, roles, and the Content those Users enter. These Terms apply to both Organizations and Users. The Privacy Policy at ${LEGAL_ROUTES.privacy} and the Billing, Subscription, Cancellation & Refund Policy at ${LEGAL_ROUTES.billing} are incorporated by reference.`,
        },
      ],
    },
    {
      id: "eligibility",
      title: "2. Eligibility and Authority",
      attorneyReview: "minimum age / capacity",
      blocks: [
        {
          type: "p",
          text: "The Service is designed for adults acting for organizations, not for children creating their own accounts. You must have legal capacity to enter a contract. In the United States that generally means you are 18 years of age or older, unless applicable law sets a different age of majority.",
        },
        {
          type: "p",
          text: "If you invite others, provision Users, or configure an Organization, you represent that you are authorized to do so. We may refuse, suspend, or limit access if we reasonably believe you lack authority or are not eligible.",
        },
      ],
    },
    {
      id: "accounts",
      title: "3. Accounts and Account Security",
      blocks: [
        {
          type: "p",
          text: "You must provide accurate registration information, including a working email address you control. You are responsible for safeguarding your password, completing multi-factor authentication when required, and protecting devices you mark as trusted. Do not share login credentials. Account sharing between people is not permitted.",
        },
        {
          type: "p",
          text: "Login uses email and password, then a second factor. The primary second factor is a code sent to the Account email. Text/SMS backup codes, when enabled, are sent only to a phone number previously verified for that Account. The sign-in form does not accept a new phone number for receiving a login code.",
        },
        {
          type: "p",
          text: "You are responsible for activity that occurs under your Account. Notify an Organization administrator and us promptly if you believe credentials, a trusted device, or an Account has been compromised. Organization administrators are responsible for provisioning, suspending, and removing Users when their role at the Organization ends.",
        },
      ],
    },
    {
      id: "organizations",
      title: "4. Organizations and Administrative Authority",
      blocks: [
        {
          type: "p",
          text: "Each Organization controls its membership. Owners, co-owners, and administrators (and other roles they assign) may grant or revoke access, set permissions, manage campuses, and configure Organization settings according to the Platform’s role model. A User may belong to more than one Organization; rights in one Organization do not automatically transfer to another.",
        },
        {
          type: "p",
          text: "Organization owners are responsible for deciding who should have access to security records, incidents, safety-concern information, schedules, and other Organization Content. Authorized members may view or edit Organization records according to assigned roles, groups, campus scope, and permissions. We do not independently decide who inside your Organization should see a given record.",
        },
      ],
    },
    {
      id: "services",
      title: "5. Description of Services",
      blocks: [
        {
          type: "p",
          text: `${PRODUCT_NAME} is a technology platform that helps organizations coordinate preparedness, security operations, and internal communication. Depending on your Subscription tier, the Service may include incident recording, team and campus management, alerts and notifications, training and certification records, scheduling, policies and procedures, dashboards and reports, hardware and medical-supply inventory, known safety-concern records, emergency-contact fields, and records related to cameras or sensors.`,
        },
        {
          type: "p",
          text: "Feature availability, usage limits (including active Users and Text/SMS allowances), and modules vary by plan. Current plan names include Servant Standard, Steward Pro, Shepherd Plus, and Omni Enterprise. We may add, change, or retire features. Some listed capabilities (including live camera viewing, sensor alarms, and push notifications) may be unavailable, limited, or marked as coming soon in the product.",
        },
      ],
    },
    {
      id: "not-dispatch",
      title: "6. Not an Emergency Dispatch Service",
      blocks: [
        {
          type: "callout",
          callout: {
            title: "Call 911 for emergencies",
            body: `${PRODUCT_NAME} is not 911, police, fire, EMS, a professional alarm-monitoring center, or a guaranteed emergency-response service. If someone needs immediate help, contact 911 or the local emergency number for your location. Do not wait for an in-app alert, email, or text message.`,
          },
        },
        {
          type: "p",
          text: "The Platform may help your team document events and notify colleagues. It does not dispatch public-safety resources and does not replace your organization’s emergency procedures.",
        },
      ],
    },
    {
      id: "no-guarantee",
      title: "7. No Guarantee of Safety or Prevention",
      blocks: [
        {
          type: "p",
          text: `Use of ${PRODUCT_NAME} does not guarantee prevention of crime, injury, emergencies, or property damage. It does not guarantee detection of every threat, accuracy of every record or alert, delivery of every notification, or availability of the Service during an emergency. The product is a coordination and recordkeeping aid. Your Organization remains responsible for physical security, staffing, training, and independent judgment.`,
        },
      ],
    },
    {
      id: "alerts",
      title: "8. Alerts and Notifications",
      blocks: [
        {
          type: "p",
          text: "The Service may send email, Text/SMS (where the plan and configuration allow), and in-app notices. Push notifications are not generally available at this time. Notifications can be delayed, blocked, filtered, rate-limited, or lost. Delivery depends on internet access, cellular networks, device settings, user preferences, and third-party providers.",
        },
        {
          type: "p",
          text: "Do not rely solely on an electronic notification as the basis for emergency action. Confirm critical information through appropriate human channels.",
        },
      ],
    },
    {
      id: "sms",
      title: "9. SMS and Electronic Communications",
      attorneyReview: "SMS consent / TCPA",
      blocks: [
        {
          type: "p",
          text: "We may send transactional messages related to your Account and Organization, including verification codes, security notices, invitation messages, incident or operational alerts your Organization configures, and service or billing notices. Message and data rates may apply when Text/SMS is used. Carriers are not liable for delayed or undelivered messages.",
        },
        {
          type: "p",
          text: "Creating an Account does not, by itself, constitute consent to receive marketing texts or marketing emails. Marketing communications, if we offer them, will be presented separately so you can choose whether to receive them. Organization-configured operational alerts are controlled by that Organization’s administrators and the endpoints those administrators or Users enroll, subject to the consent tools in the product.",
        },
      ],
    },
    {
      id: "ugc",
      title: "10. User-Generated Content",
      blocks: [
        {
          type: "p",
          text: "Users may submit incident reports, notes, photographs, attachments, safety-concern descriptions, people or vehicle descriptions, policies, procedures, training materials, schedules, inventory records, and similar Content. You are responsible for the legality, accuracy, authorization, and appropriateness of Content you submit, and for having the rights needed to upload it.",
        },
      ],
    },
    {
      id: "sensitive",
      title: "11. Sensitive Information",
      blocks: [
        {
          type: "p",
          text: "The Service may hold sensitive organizational security information, including procedures, facility details, camera or equipment records, incident files, information about minors that appears in authorized Organization records, medical-incident notes your team chooses to enter, and personal information about members or visitors.",
        },
        {
          type: "ul",
          items: [
            "Do not upload Social Security numbers, government ID images used for identity proofing, password lists, or financial-account credentials unless a specific product workflow requires a limited identifier and you are authorized to provide it.",
            "Do not store highly sensitive medical records that your Organization is not authorized to keep in this system.",
            "Limit Content to what is needed for legitimate Platform use.",
          ],
        },
      ],
    },
    {
      id: "safety-concerns",
      title: "12. Known Safety Concerns and Person-Related Information",
      blocks: [
        {
          type: "p",
          text: "Some plans allow Organizations to keep known safety-concern profiles and related notes or photos. We do not independently verify allegations. The Organization and the Users who create or maintain those records are responsible for having a lawful, legitimate purpose and for complying with privacy, employment, civil-rights, and other applicable laws.",
        },
        {
          type: "p",
          text: `You must not use ${PRODUCT_NAME} to harass, stalk, discriminate, defame, retaliate, invent accusations, or maintain an unlawful watchlist. Misuse may result in suspension and may be reported where required by law.`,
        },
      ],
    },
    {
      id: "photos",
      title: "13. Photos, Images, and Surveillance Information",
      attorneyReview: "recording / surveillance laws",
      blocks: [
        {
          type: "p",
          text: "Incident photos, safety-concern photos, hardware photos, logos, and profile photos may be stored in the Service. Camera and sensor modules, where enabled, may store configuration and related records. Live video viewing and recording integrations are not generally available in the current product and, if introduced, remain your Organization’s responsibility to operate lawfully.",
        },
        {
          type: "p",
          text: "You and your Organization must comply with notice, consent, recording, and privacy laws that apply to photographs, video, and audio in your locations. Use of the Service does not make recording or surveillance lawful.",
        },
      ],
    },
    {
      id: "customer-data",
      title: "14. Organization Content and Customer Data",
      blocks: [
        {
          type: "p",
          text: `As between you and us, your Organization retains its rights in Customer Content it submits. We do not claim ownership of your incident files or other Organization records. You grant us a limited license to host, store, process, transmit, display, back up, and otherwise handle Customer Content solely to provide, secure, maintain, and improve the Service, to prevent abuse, and as described in the Privacy Policy.`,
        },
        {
          type: "p",
          text: "This license is not a perpetual assignment of your security records. It lasts as long as needed to operate the Service and meet legal and operational obligations, including backups and residual copies that are deleted on a rolling schedule.",
        },
      ],
    },
    {
      id: "acceptable-use",
      title: "15. Acceptable Use",
      blocks: [
        {
          type: "p",
          text: "You may not use the Service to:",
        },
        {
          type: "ul",
          items: [
            "Violate law, or commit fraud, impersonation, harassment, threats, stalking, or defamation.",
            "Conduct unauthorized surveillance or illegal discrimination.",
            "Upload malware, attempt to bypass security, steal credentials, or disrupt the Service.",
            "Scrape, crawl, or apply excessive automated load except as allowed by a written API agreement or applicable law that cannot be waived (including limited reverse engineering for interoperability where legally protected).",
            "Resell or sublicense the Service without our written permission.",
          ],
        },
      ],
    },
    {
      id: "tiers",
      title: "16. Subscription Tiers",
      blocks: [
        {
          type: "p",
          text: "Paid and assigned plans currently include Servant Standard, Steward Pro, Shepherd Plus, and Omni Enterprise. Features, active-user limits, campus limits, and Text/SMS allowances differ by plan. See your Organization’s billing and plan screens for the plan in effect. We do not put prices in these Terms; pricing is shown in the product when a payment method is connected, or as otherwise agreed in writing.",
        },
        {
          type: "p",
          text: `Billing mechanics are described in the Billing Policy (${LEGAL_ROUTES.billing}). Additional modules or usage may require additional fees if we introduce them and you agree to them.`,
        },
      ],
    },
    {
      id: "third-parties",
      title: "17. Third-Party Services",
      blocks: [
        {
          type: "p",
          text: "The Service depends on third parties, which may include cloud hosting, database and authentication providers, email delivery, Text/SMS delivery, payment processors (when connected), and device or camera vendors if you later connect them. We do not guarantee that a third-party integration will remain available, unchanged, or error-free. Outages or policy changes at a provider can affect the Service.",
        },
      ],
    },
    {
      id: "ip",
      title: "18. Software and Intellectual Property",
      blocks: [
        {
          type: "p",
          text: `We and our licensors own the Service software, visual design, documentation, and ${PRODUCT_NAME} names and logos. We grant you a limited, non-exclusive, non-transferable license to use the Service during your Subscription, solely for your Organization’s internal operations. You may not copy, modify, or create derivative works of the Platform except as the Service’s ordinary use allows. Open-source components are licensed under their own terms.`,
        },
      ],
    },
    {
      id: "beta",
      title: "19. Beta and Incomplete Features",
      blocks: [
        {
          type: "p",
          text: "Some product areas are labeled coming soon or are incomplete, including certain camera, sensor, and push-notification experiences. Experimental or unfinished features may change, contain errors, or be withdrawn without liability beyond what these Terms otherwise allow.",
        },
      ],
    },
    {
      id: "ai",
      title: "20. Automated and AI Features",
      blocks: [
        {
          type: "p",
          text: "The Service does not currently provide customer-facing artificial-intelligence analysis, summaries, or recommendations. If we add such features, outputs may be incomplete or incorrect. You must use independent judgment. Automated output is not legal, medical, law-enforcement, or professional security advice.",
        },
      ],
    },
    {
      id: "availability",
      title: "21. Availability and Changes",
      blocks: [
        {
          type: "p",
          text: "We may perform maintenance, upgrade software, modify features, or experience outages. We do not promise uninterrupted or error-free operation, and we do not publish a service-level agreement in these Terms. We are not responsible for delays caused by events beyond our reasonable control, including network failures, provider outages, and natural disasters.",
        },
      ],
    },
    {
      id: "termination",
      title: "22. Suspension and Termination",
      blocks: [
        {
          type: "p",
          text: "You may stop using the Service at any time. Organization owners may cancel a Subscription as described in the Billing Policy. We may suspend or terminate access for violation of these Terms, suspected abuse, legal compliance, nonpayment, or risk to the Service or other customers.",
        },
        {
          type: "p",
          text: "Cancellation of a Subscription is designed not to delete Organization records by itself. Closing an Organization account in product settings changes operational status; it is not a hard delete of historical records. We do not currently provide a self-service tool for an individual to delete their entire Account across all Organizations. Residual copies may remain in backups for a limited period.",
        },
      ],
    },
    {
      id: "warranty",
      title: "23. Warranty Disclaimer",
      attorneyReview: "warranty disclaimer enforceability",
      blocks: [
        {
          type: "p",
          text: `TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE.” WE DISCLAIM ALL WARRANTIES, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL PREVENT HARM, DETECT EVERY INCIDENT, OR DELIVER EVERY NOTICE.`,
        },
      ],
    },
    {
      id: "liability",
      title: "24. Limitation of Liability",
      attorneyReview: "limitation of liability",
      blocks: [
        {
          type: "p",
          text: "TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE AND OUR SUPPLIERS WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES; LOST PROFITS, REVENUE, OR GOODWILL; LOST OR CORRUPTED DATA; SERVICE INTERRUPTION; FAILED, LATE, OR MISDIRECTED NOTIFICATIONS; OR DECISIONS MADE BASED ON USER-GENERATED OR INCOMPLETE INFORMATION, EVEN IF WE WERE ADVISED THAT SUCH DAMAGES WERE POSSIBLE.",
        },
        {
          type: "p",
          text: "TO THE MAXIMUM EXTENT PERMITTED BY LAW, OUR TOTAL LIABILITY FOR CLAIMS ARISING OUT OF OR RELATED TO THE SERVICE IS LIMITED TO THE AMOUNTS YOUR ORGANIZATION PAID TO US FOR THE SERVICE DURING THE TWELVE (12) MONTHS BEFORE THE CLAIM. IF YOU HAVE PAID NOTHING DURING THAT PERIOD, OUR LIABILITY IS LIMITED TO FIFTY U.S. DOLLARS (US $50). SOME JURISDICTIONS DO NOT ALLOW CERTAIN LIMITATIONS; IN THOSE JURISDICTIONS OUR LIABILITY IS LIMITED TO THE GREATEST EXTENT PERMITTED.",
        },
      ],
    },
    {
      id: "indemnity",
      title: "25. Indemnification",
      attorneyReview: "indemnification",
      blocks: [
        {
          type: "p",
          text: "You will defend, indemnify, and hold harmless us and our personnel from claims, damages, losses, and reasonable expenses (including attorneys’ fees) arising out of your unlawful use of the Service, Content you submit, infringement of third-party rights, or your violation of these Terms or applicable law, except to the extent caused by our willful misconduct.",
        },
      ],
    },
    {
      id: "governing-law",
      title: "26. Governing Law",
      attorneyReview: "governing law and venue",
      blocks: [
        {
          type: "p",
          text: "These Terms are intended to be interpreted under the laws of the United States. A specific state governing law and exclusive venue have not been designated in this version. Until an updated version names a state and forum, the parties will use good-faith informal resolution, and any court action will be brought in a court of competent jurisdiction in the United States, subject to applicable consumer-protection laws that cannot be waived.",
        },
      ],
    },
    {
      id: "disputes",
      title: "27. Dispute Resolution",
      attorneyReview: "dispute resolution / arbitration / class actions",
      blocks: [
        {
          type: "p",
          text: "Before filing a claim, you agree to contact us at the legal notice address below and try to resolve the dispute informally for at least thirty (30) days. These Terms do not require arbitration and do not include a class-action waiver. Either party may pursue available court remedies subject to Section 26. This section will be updated if counsel adopts a different dispute process.",
        },
      ],
    },
    {
      id: "changes",
      title: "28. Changes to Terms",
      blocks: [
        {
          type: "p",
          text: `We may update these Terms. The “Last updated” date and version number will change. For material changes, we may provide additional notice through the Service or email where reasonably practicable. If you continue to use the Service after the updated Terms take effect, that use constitutes acceptance where the law allows. If you do not agree, you must stop using the Service.`,
        },
      ],
    },
    {
      id: "electronic",
      title: "29. Electronic Communications",
      blocks: [
        {
          type: "p",
          text: "You consent to receive notices electronically, including through the Service and the email address on your Account. Legal notices to us should be sent to the contacts below.",
        },
      ],
    },
    {
      id: "contact",
      title: "30. Contact Information",
      blocks: [
        {
          type: "ul",
          items: [
            `Legal questions: ${LEGAL_CONTACT_EMAIL}`,
            `Support: ${SUPPORT_EMAIL}`,
            `Billing: ${BILLING_CONTACT_EMAIL}`,
            `Mailing address: ${mailingAddressDisplay()}`,
          ],
        },
      ],
    },
  ],
};

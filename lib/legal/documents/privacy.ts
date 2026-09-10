import {
  LEGAL_ROUTES,
  POLICY_DATES,
  POLICY_VERSIONS,
  PRIVACY_CONTACT_EMAIL,
  PRODUCT_NAME,
  SUPPORT_EMAIL,
  mailingAddressDisplay,
  operatorLabel,
} from "@/lib/legal/config";
import type { LegalDocument } from "@/lib/legal/types";

const operator = operatorLabel();

export const PRIVACY_DOCUMENT: LegalDocument = {
  slug: "privacy",
  title: "Privacy Policy",
  metaTitle: "Sanctuary Protected Privacy Policy",
  metaDescription:
    "How Sanctuary Protected collects, uses, and shares information for accounts, organizations, incidents, notifications, and authentication.",
  version: POLICY_VERSIONS.privacy,
  effectiveDate: POLICY_DATES.privacyEffective,
  lastUpdated: POLICY_DATES.privacyUpdated,
  intro: `This Privacy Policy describes how ${operator} handles information in connection with ${PRODUCT_NAME}. It covers our websites and the hosted Service. It does not cover websites or cameras operated solely by your Organization outside the Service.`,
  sections: [
    {
      id: "introduction",
      title: "1. Introduction",
      blocks: [
        {
          type: "p",
          text: `${PRODUCT_NAME} is a software platform Organizations use to manage security operations, incidents, notifications, training, and related records. When you use the Service as a member of an Organization, much of the information you enter is Customer Content that Organization administrators can access according to roles and permissions. Our Terms of Service (${LEGAL_ROUTES.terms}) and Billing Policy (${LEGAL_ROUTES.billing}) describe the commercial relationship.`,
        },
      ],
    },
    {
      id: "roles",
      title: "2. Organizations and Our Role",
      attorneyReview: "controller / processor / service provider terminology",
      blocks: [
        {
          type: "p",
          text: "Organizations decide what operational records to keep, whom to invite, and which roles those people receive. We process that information to host and operate the Service for the Organization. Requests to correct or delete incident files, safety-concern profiles, or other Organization records should generally be directed first to that Organization. We process Account authentication data, security logs, and platform telemetry to operate, secure, and bill the Service.",
        },
        {
          type: "p",
          text: "Whether we act as a “service provider,” “processor,” or another legal role can depend on the information type and applicable law. That characterization should be confirmed in a customer agreement where required.",
        },
      ],
    },
    {
      id: "collect",
      title: "3. Information We Collect",
      blocks: [
        {
          type: "p",
          text: "The categories below reflect features that exist in the product today. Your Organization may not use every module.",
        },
        {
          type: "ul",
          items: [
            "Account information: name, email address, password (stored by our authentication provider, not in recoverable plain text in application tables), optional profile phone, profile photo, and user identifiers.",
            "Organization information: Organization name, slug, addresses, campus records, branding, emergency-contact fields, and settings.",
            "Security and authentication: sign-in events, MFA challenge metadata, whether a verified backup phone exists, trusted-device records, MFA session cookies, IP addresses collected for audit and security, and similar logs.",
            "Incident information: reports, categories, locations, timestamps, notes, team assignments, and photographs or attachments when the plan allows.",
            "Safety-concern information: profiles, notes, and photos when the plan allows.",
            "Training, certification, scheduling, hardware inventory, medical-supply inventory, and policy-document files when those modules are used.",
            "Communication information: notification contents and delivery status, enrolled email or Text/SMS endpoints, and consent records for Text/SMS operational alerts where the product collects them.",
            "Billing information: plan, subscription status, and billing history in our application database. We do not currently operate a connected card checkout. We do not store payment-card numbers in the application. If a payment processor is connected later, card data would be handled by that processor.",
            "Technical information: browser and device characteristics needed to run the site, cookies described below, and application logs.",
            "Support communications: messages you send to support mailboxes or through in-product help feedback.",
          ],
        },
      ],
    },
    {
      id: "sensitive",
      title: "4. Sensitive Information",
      attorneyReview: "HIPAA / special category data",
      blocks: [
        {
          type: "p",
          text: "Customers may enter information that is sensitive in context: incident narratives, safety concerns, notes that mention medical events, information about minors that appears in Organization records, building or camera details, and photographs. We do not claim that the Service is HIPAA compliant, and these Terms and this Policy are not a Business Associate Agreement. Do not treat the Platform as a medical-records system.",
        },
      ],
    },
    {
      id: "how-collected",
      title: "5. How Information Is Collected",
      blocks: [
        {
          type: "ul",
          items: [
            "Directly from you when you register, update a profile, or submit records.",
            "From Organization administrators who invite or provision you and configure the tenant.",
            "Automatically when you use the Service (logs, cookies, security events).",
            "From email and (where configured) Text/SMS providers that report delivery status.",
            "From a payment processor if one is connected in the future.",
            "From support requests.",
          ],
        },
      ],
    },
    {
      id: "use",
      title: "6. How We Use Information",
      blocks: [
        {
          type: "ul",
          items: [
            "Provide Platform features you and your Organization request.",
            "Authenticate Users, enforce MFA and trusted-device rules, and prevent unauthorized access.",
            "Send operational notifications your Organization configures and Account security messages.",
            "Maintain incidents, inventory, schedules, and similar modules.",
            "Operate subscriptions, show plan limits, and (when a processor is connected) process payments.",
            "Provide support, troubleshoot, prevent fraud and abuse, and improve reliability.",
            "Comply with law and enforce our Terms.",
          ],
        },
      ],
    },
    {
      id: "communications",
      title: "7. Notifications and Communications",
      blocks: [
        {
          type: "p",
          text: "We use email for Account security codes, invitations, and many operational notices. Text/SMS may be used for MFA backup to a verified number, which is separate from application SMS messaging. Application SMS is sent only after you complete the SMS enrollment on your profile. In-app notices may appear in the product. Push notifications are not generally enabled. Operational and security messages are distinct from marketing. We do not use Account creation, a stored mobile number, or MFA enrollment as marketing-text consent.",
        },
      ],
    },
    {
      id: "sms-messaging",
      title: "8. SMS Messaging and Mobile Numbers",
      attorneyReview: "[LEGAL REVIEW REQUIRED — SMS CONSENT] SMS data handling",
      blocks: [
        {
          type: "p",
          text: `We may collect a mobile phone number you or an authorized administrator enter on a profile. That number is contact information. It is not permission to send application SMS. If you enroll in ${PRODUCT_NAME} SMS messaging, we also store consent status, the consent wording version you accepted, the Privacy Policy and Terms versions in effect, verification state, opt-out events, destination region, and related timestamps. We do not store SMS verification codes in recoverable form.`,
        },
        {
          type: "p",
          text: "We use enrolled numbers to send the operational messages you opt into, such as security alerts, incident notifications, scheduling updates, training or certification reminders, and account or service notices, and to send enrollment verification or confirmation texts. Message frequency varies. Message and data rates may apply.",
        },
        {
          type: "p",
          text: `Reply STOP to opt out of SMS messages, including STOPALL, END, QUIT, CANCEL, or UNSUBSCRIBE where supported. You can also use Opt Out of SMS Messaging on your profile. Reply HELP or email ${SUPPORT_EMAIL} for help. You can update your mobile number on your profile; a new number requires a new enrollment and is not automatically opted in. SMS two-factor authentication, when used, is a separate control and does not enroll you in application SMS.`,
        },
        {
          type: "p",
          text: "Messaging platform providers, telecommunications carriers, and other infrastructure providers necessarily process numbers and message content to deliver texts. We do not sell, rent, or share SMS opt-in or consent information for third-party marketing purposes.",
        },
      ],
    },
    {
      id: "sharing",
      title: "9. Information Sharing",
      blocks: [
        {
          type: "p",
          text: "We share information with service providers that host, authenticate, store, send email, send Text/SMS (when used), and otherwise help us run the Service. We may share information with professional advisers, in a business transfer, or with authorities when we believe disclosure is required or appropriate under law. We do not operate an advertising network and do not share personal information for cross-context behavioral advertising.",
        },
        {
          type: "p",
          text: "Provider names can change as our architecture evolves. A separate subprocessor list may be published later. Authorized Users inside your Organization can access Customer Content according to permissions; that is not a “sale” to a third party.",
        },
      ],
    },
    {
      id: "org-access",
      title: "10. Organization Access",
      blocks: [
        {
          type: "p",
          text: "Owners, administrators, security leaders, and other roles may see different slices of Organization data. Access can also depend on group membership, campus assignment, and temporary permissions. Platform operators (our internal administration tools) may access tenant data as needed to support, secure, or operate the Service, subject to internal controls.",
        },
      ],
    },
    {
      id: "multi-org",
      title: "11. Multi-Organization Accounts",
      blocks: [
        {
          type: "p",
          text: "If you belong to more than one Organization, your login is shared but membership, roles, and records are scoped per Organization. Switching Organizations changes which tenant data you can see. We design access controls to keep tenant data separated; you must still choose the correct Organization before acting.",
        },
      ],
    },
    {
      id: "selling",
      title: "12. Sale of Personal Information and Advertising",
      blocks: [
        {
          type: "p",
          text: "We do not sell personal information for money. We do not share personal information with third parties for their independent marketing. We do not sell, rent, or share SMS opt-in or consent information for third-party marketing purposes. The Service does not currently include third-party advertising or analytics pixels. If that changes, we will update this Policy and any required notices.",
        },
      ],
    },
    {
      id: "cookies",
      title: "13. Cookies and Similar Technologies",
      blocks: [
        {
          type: "p",
          text: "We use cookies and similar storage that are necessary to operate the Service:",
        },
        {
          type: "ul",
          items: [
            "Authentication session cookies issued by our identity provider so you remain signed in.",
            "An MFA session cookie that records whether the current login has completed (or is not required to complete) second-factor checks.",
            "A trusted-device cookie, if you choose to remember a browser after MFA.",
            "An active-Organization cookie so the product knows which tenant you selected.",
            "Theme preference storage (typically in the browser) for light/dark display.",
          ],
        },
        {
          type: "p",
          text: "These are security and preference technologies, not advertising cookies. We do not currently use third-party analytics cookies. Blocking required cookies will prevent sign-in or MFA from working.",
        },
      ],
    },
    {
      id: "trusted-devices",
      title: "14. Trusted Devices and Authentication Security",
      blocks: [
        {
          type: "p",
          text: "If you register a trusted device, we store a device record associated with your user identifier and issue a browser cookie so later visits can skip a repeated MFA prompt for a limited period, subject to Organization or platform policy (including requirements to complete MFA again). We may also store timestamps and coarse device or browser information for security. We do not describe token internals here.",
        },
      ],
    },
    {
      id: "security",
      title: "15. Data Security",
      blocks: [
        {
          type: "p",
          text: "We use commercially reasonable technical and organizational measures, including encrypted connections in transit, authentication, optional and policy-driven MFA, role-based permissions, database access rules, and audit logging. No method of transmission or storage is perfectly secure. You must also protect passwords, trusted devices, and who you invite into your Organization.",
        },
      ],
    },
    {
      id: "retention",
      title: "16. Data Retention",
      attorneyReview: "data retention periods",
      blocks: [
        {
          type: "p",
          text: "Retention depends on Account status, Organization relationship, Subscription, record type, backups, and legal duties. We have not published numeric retention schedules for each table. Organization records generally remain until the Organization removes them through product workflows or we delete them after an Organization relationship ends and residual backup cycles complete. Authentication logs and security records may be kept as needed to investigate abuse.",
        },
      ],
    },
    {
      id: "deletion",
      title: "17. Account Closure and Deletion",
      blocks: [
        {
          type: "p",
          text: "An individual User can update their profile name, phone, and photo. The product does not currently offer a self-service control to erase an entire personal Account across all Organizations. Organization owners and administrators can suspend or remove memberships; removal does not by itself wipe historical incident or audit records that referenced that User.",
        },
        {
          type: "p",
          text: "Organization owners can suspend or close an Organization in settings. Closure is an operational status change; the product states that permanent deletion of Organization history is not available through that control. Subscription cancellation is designed not to delete Customer Content. We do not currently offer a full Organization data-export package in the product, though some modules may allow limited exports based on permissions.",
        },
      ],
    },
    {
      id: "rights",
      title: "18. Privacy Rights",
      attorneyReview: "US state privacy rights",
      blocks: [
        {
          type: "p",
          text: "Depending on where you live, you may have rights to request access, correction, deletion, or a copy of certain personal information, to appeal a denial, or to opt out of certain processing. These rights may not apply to every record—especially Customer Content controlled by an Organization, or information we must keep for security or law. To make a request, email the privacy contact below. We may need to verify your identity and may direct Organization-record requests to your Organization.",
        },
      ],
    },
    {
      id: "california",
      title: "19. California Privacy Notice",
      attorneyReview: "CCPA / CPRA applicability",
      blocks: [
        {
          type: "p",
          text: "If you are a California resident, you may have additional rights under California law, including to know, delete, and correct personal information, and to opt out of “sale” or “sharing” as those terms are defined by statute. We do not sell personal information for money and do not share it for cross-context behavioral advertising. We do not currently operate a dedicated “Do Not Sell or Share” link because those activities are not part of the Service. This section is a summary, not a determination that any particular statute applies to every visitor.",
        },
      ],
    },
    {
      id: "children",
      title: "20. Children’s Privacy",
      attorneyReview: "COPPA / children’s privacy",
      blocks: [
        {
          type: "p",
          text: `${PRODUCT_NAME} Accounts are intended for adults who work for Organizations. We do not knowingly allow children to create their own Accounts. Organizations may enter information about minors in incident or safety records when they have a lawful reason to do so. That is Organization-controlled Customer Content, not a child-directed social app. If you believe a child created an Account, contact us and we will take appropriate steps.`,
        },
      ],
    },
    {
      id: "international",
      title: "21. International Users",
      attorneyReview: "GDPR / international transfers",
      blocks: [
        {
          type: "p",
          text: "The Service is designed primarily for Organizations in the United States. We do not represent that the Service is offered with GDPR-standard contracts or transfer tools. If you access the Service from outside the United States, you understand that information may be processed in the United States.",
        },
      ],
    },
    {
      id: "legal-requests",
      title: "22. Law Enforcement and Legal Requests",
      blocks: [
        {
          type: "p",
          text: "We may disclose information when we believe it is reasonably required by law, subpoena, court order, or a lawful government request, or to protect the rights, safety, or security of our users, the public, or the Service.",
        },
      ],
    },
    {
      id: "transfers",
      title: "23. Business Transfers",
      blocks: [
        {
          type: "p",
          text: "If we are involved in a merger, acquisition, financing, reorganization, or sale of assets, information may be transferred as part of that transaction, subject to this Policy or a successor policy.",
        },
      ],
    },
    {
      id: "changes",
      title: "24. Changes to This Policy",
      blocks: [
        {
          type: "p",
          text: "We may update this Policy. The effective and last-updated dates and version number will change. Material changes may be announced through the Service or email when reasonably practicable.",
        },
      ],
    },
    {
      id: "contact",
      title: "25. Contact Information",
      blocks: [
        {
          type: "ul",
          items: [
            `Privacy questions: ${PRIVACY_CONTACT_EMAIL}`,
            `Support: ${SUPPORT_EMAIL}`,
            `Mailing address: ${mailingAddressDisplay()}`,
          ],
        },
      ],
    },
  ],
};

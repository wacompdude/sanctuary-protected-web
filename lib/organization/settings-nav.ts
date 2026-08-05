export const CHURCH_SETTINGS_SECTIONS = [
  {
    id: "general",
    href: "/settings/church/general",
    label: "General",
    description: "Church name, slug, denomination, description, and time zone.",
  },
  {
    id: "contact",
    href: "/settings/church/contact",
    label: "Contact Information",
    description:
      "Organization details and role-based leadership, security, and vendor contacts.",
  },
  {
    id: "branding",
    href: "/settings/church/branding",
    label: "Branding",
    description: "Logo upload and brand colors.",
  },
  {
    id: "security",
    href: "/settings/church/security",
    label: "Security and Emergency Information",
    description: "Emergency contacts and incident requirements.",
  },
  {
    id: "preferences",
    href: "/settings/church/preferences",
    label: "Application Preferences",
    description: "Date formats, landing page, and feature toggles.",
  },
  {
    id: "account",
    href: "/settings/church/account",
    label: "Account Status",
    description: "Plan, trial, and account metadata.",
  },
  {
    id: "danger",
    href: "/settings/church/danger",
    label: "Danger Zone",
    description: "Suspend, reactivate, or close this church account.",
  },
] as const;

export type ChurchSettingsSectionId =
  (typeof CHURCH_SETTINGS_SECTIONS)[number]["id"];

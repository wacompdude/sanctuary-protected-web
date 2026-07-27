export const DEMO_SEED_SOURCE = "first-church-demo" as const;

export const DEMO_CHURCH_NAME = "First Church of the First Church";
export const DEMO_CHURCH_SLUG = "first-church-of-the-first-church";
export const DEMO_CHURCH_EMAIL = "church@fcotfc.org";
export const DEMO_CHURCH_TIMEZONE = "America/Los_Angeles";
export const DEMO_WEEK_STARTS_ON = 0; // Sunday

export const DEMO_OWNER_PLATFORM_EMAIL = "repus_admin@sanctuaryprotected.com";

export const DEMO_PRIMARY_CAMPUS = {
  seedKey: "campus.primary",
  name: "First Church of the First Church – Anytown Campus",
  slug: "main",
  address_line_1: "12345 Main Street",
  city: "Anytown",
  state: "WI",
  postal_code: "12345",
  country: "United States",
  timezone: "America/Los_Angeles",
  is_primary: true,
} as const;

export const DEMO_SUNSHINE_CAMPUS = {
  seedKey: "campus.sunshine",
  name: "First Church of the First Church – Sunshine Campus",
  slug: "sunshine",
  address_line_1: "5555 Lake Wood Drive",
  city: "Sunshine",
  state: "FL",
  postal_code: "45698",
  country: "United States",
  timezone: "America/New_York",
  is_primary: false,
} as const;

/** Role mapping: prompt label → membership_role enum. */
export const DEMO_ROLE_MAP = {
  Owner: "owner",
  "Co-owner": "co_owner",
  Administrator: "administrator",
  "Security Leader": "security_leader",
  "Security Member": "security_member",
  Viewer: "viewer",
} as const;

export type DemoNamedUser = {
  seedKey: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: "co_owner" | "administrator" | "security_leader" | "security_member" | "viewer";
  enableEmailNotifications?: boolean;
};

export const DEMO_NAMED_USERS: DemoNamedUser[] = [
  {
    seedKey: "user.co_owner",
    firstName: "Bob",
    lastName: "Smith",
    email: "sc_co_owner@sanctuaryprotected.com",
    phone: "0987654321",
    role: "co_owner",
  },
  {
    seedKey: "user.administrator",
    firstName: "Nora",
    lastName: "Jones",
    email: "sc_administrator@sanctuaryprotected.com",
    phone: "6549870321",
    role: "administrator",
  },
  {
    seedKey: "user.security_leader",
    firstName: "John",
    lastName: "Smith",
    email: "sc_security_leader@sanctuaryprotected.com",
    phone: "2135558787",
    role: "security_leader",
    enableEmailNotifications: true,
  },
  {
    seedKey: "user.security_member_hannibal",
    firstName: "Hannibal",
    lastName: "Smith",
    email: "sc_security_member@sanctuaryprotected.com",
    phone: "1225528326",
    role: "security_member",
    enableEmailNotifications: true,
  },
  {
    seedKey: "user.security_member_angus",
    firstName: "Angus",
    lastName: "McGyver",
    email: "sc_member@sanctuaryprotected.com",
    phone: "8437463649",
    role: "security_member",
  },
  {
    seedKey: "user.viewer",
    firstName: "Ansel",
    lastName: "Adams",
    email: "sc_viewer@sanctuaryprotected.com",
    phone: "2522534483",
    role: "viewer",
  },
];

export const DEMO_EXTRA_MEMBERS: Array<{
  seedKey: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}> = [
  {
    seedKey: "user.extra.michael_carter",
    firstName: "Michael",
    lastName: "Carter",
    email: "michael.carter@fcotfc.test",
    phone: "5550101001",
  },
  {
    seedKey: "user.extra.sarah_mitchell",
    firstName: "Sarah",
    lastName: "Mitchell",
    email: "sarah.mitchell@fcotfc.test",
    phone: "5550101002",
  },
  {
    seedKey: "user.extra.david_thompson",
    firstName: "David",
    lastName: "Thompson",
    email: "david.thompson@fcotfc.test",
    phone: "5550101003",
  },
  {
    seedKey: "user.extra.rebecca_lewis",
    firstName: "Rebecca",
    lastName: "Lewis",
    email: "rebecca.lewis@fcotfc.test",
    phone: "5550101004",
  },
  {
    seedKey: "user.extra.thomas_walker",
    firstName: "Thomas",
    lastName: "Walker",
    email: "thomas.walker@fcotfc.test",
    phone: "5550101005",
  },
  {
    seedKey: "user.extra.emily_parker",
    firstName: "Emily",
    lastName: "Parker",
    email: "emily.parker@fcotfc.test",
    phone: "5550101006",
  },
  {
    seedKey: "user.extra.daniel_brooks",
    firstName: "Daniel",
    lastName: "Brooks",
    email: "daniel.brooks@fcotfc.test",
    phone: "5550101007",
  },
  {
    seedKey: "user.extra.rachel_turner",
    firstName: "Rachel",
    lastName: "Turner",
    email: "rachel.turner@fcotfc.test",
    phone: "5550101008",
  },
];

/** Prompt labels → app threat_level values. */
export const DEMO_THREAT_WEEK_LEVELS = [
  "green",
  "green",
  "blue",
  "yellow",
  "blue",
  "green",
  "yellow",
  "orange",
  "blue",
  "green",
] as const;

export const DEMO_NOTIFICATION_TYPES_FOR_EMAIL = [
  "incident.created",
  "incident.critical",
  "incident.updated",
  "incident.follow_up_required",
  "schedule.assignment_created",
  "schedule.assignment_changed",
  "schedule.assignment_reminder",
  "schedule.shift_cancelled",
  "certification.expiring",
  "certification.expired",
  "safety_concern.review_due",
  "equipment.maintenance_due",
  "equipment.warranty_expiring",
  "emergency.alert",
] as const;

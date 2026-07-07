export type IncidentStatus = "open" | "investigating" | "resolved";

export interface Incident {
  id: string;
  title: string;
  location: string;
  status: IncidentStatus;
  reportedAt: string;
  severity: "low" | "medium" | "high";
}

export interface Certification {
  id: string;
  name: string;
  holder: string;
  issuedAt: string;
  expiresAt: string;
  status: "valid" | "expiring" | "expired";
}

export const dashboardStats = [
  {
    label: "Active Incidents",
    value: "3",
    description: "2 investigating, 1 open",
  },
  {
    label: "Certifications",
    value: "12",
    description: "All team members current",
  },
  {
    label: "Cameras Online",
    value: "24",
    description: "98% uptime this week",
  },
  {
    label: "Sensors Active",
    value: "18",
    description: "No alerts in the last 24h",
  },
];

export const mockIncidents: Incident[] = [
  {
    id: "INC-1042",
    title: "Motion detected near north gate",
    location: "North Gate",
    status: "investigating",
    reportedAt: "2026-07-06T14:32:00",
    severity: "medium",
  },
  {
    id: "INC-1041",
    title: "Camera offline — parking lot B",
    location: "Parking Lot B",
    status: "open",
    reportedAt: "2026-07-06T09:15:00",
    severity: "low",
  },
  {
    id: "INC-1039",
    title: "Unauthorized access attempt",
    location: "Main Entrance",
    status: "resolved",
    reportedAt: "2026-07-05T22:08:00",
    severity: "high",
  },
  {
    id: "INC-1037",
    title: "Smoke sensor triggered — kitchen",
    location: "Building A, Kitchen",
    status: "resolved",
    reportedAt: "2026-07-04T11:45:00",
    severity: "high",
  },
  {
    id: "INC-1035",
    title: "Perimeter fence sensor alert",
    location: "East Perimeter",
    status: "investigating",
    reportedAt: "2026-07-03T03:22:00",
    severity: "medium",
  },
];

export const mockCertifications: Certification[] = [
  {
    id: "CERT-001",
    name: "CPR & First Aid",
    holder: "Sarah Chen",
    issuedAt: "2025-03-15",
    expiresAt: "2027-03-15",
    status: "valid",
  },
  {
    id: "CERT-002",
    name: "Security Guard License",
    holder: "Marcus Johnson",
    issuedAt: "2024-06-01",
    expiresAt: "2026-06-01",
    status: "expiring",
  },
  {
    id: "CERT-003",
    name: "Fire Safety Training",
    holder: "Elena Rodriguez",
    issuedAt: "2025-01-10",
    expiresAt: "2027-01-10",
    status: "valid",
  },
  {
    id: "CERT-004",
    name: "Defensive Driving",
    holder: "James Park",
    issuedAt: "2023-08-20",
    expiresAt: "2025-08-20",
    status: "expired",
  },
  {
    id: "CERT-005",
    name: "Hazmat Awareness",
    holder: "Aisha Patel",
    issuedAt: "2025-11-05",
    expiresAt: "2027-11-05",
    status: "valid",
  },
  {
    id: "CERT-006",
    name: "Emergency Response",
    holder: "David Kim",
    issuedAt: "2024-09-12",
    expiresAt: "2026-09-12",
    status: "valid",
  },
];

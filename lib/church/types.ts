export type AppRole = "member" | "administrator" | "security_leader";

export interface Church {
  id: string;
  name: string;
}

export interface Profile {
  id: string;
  church_id: string;
  full_name: string | null;
  role: AppRole;
}

export type ActionState = {
  error?: string | null;
  success?: boolean;
  fieldErrors?: Record<string, string>;
};

export const CERT_MANAGEMENT_ROLES: AppRole[] = [
  "administrator",
  "security_leader",
];

export function canManageCertifications(role: AppRole): boolean {
  return CERT_MANAGEMENT_ROLES.includes(role);
}

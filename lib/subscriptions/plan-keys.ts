export const PLAN_KEYS = {
  SERVANT_STANDARD: "servant_standard",
  STEWARD_PRO: "steward_pro",
  SHEPHERD_PLUS: "shepherd_plus",
  OMNI_ENTERPRISE: "omni_enterprise",
} as const;

export type PlanKey = (typeof PLAN_KEYS)[keyof typeof PLAN_KEYS];

export const PLAN_KEY_LIST: readonly PlanKey[] = Object.values(PLAN_KEYS);

export function isPlanKey(value: string): value is PlanKey {
  return (PLAN_KEY_LIST as readonly string[]).includes(value);
}

export const PLAN_DISPLAY_NAMES: Record<PlanKey, string> = {
  [PLAN_KEYS.SERVANT_STANDARD]: "Servant Standard",
  [PLAN_KEYS.STEWARD_PRO]: "Steward Pro",
  [PLAN_KEYS.SHEPHERD_PLUS]: "Shepherd Plus",
  [PLAN_KEYS.OMNI_ENTERPRISE]: "Omni Enterprise",
};

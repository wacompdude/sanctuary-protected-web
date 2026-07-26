/**
 * Pure customer Help Center access policy.
 * Safe for Expo / React Native — no Next.js or platform-admin imports.
 */

/**
 * Church Help Center is available to every authenticated church member.
 * Never gate with feature entitlements or plan names.
 */
export function canAccessCustomerHelpCenter(): boolean {
  return true;
}

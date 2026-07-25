/** Platform route helpers (setup vs console). */

export const PLATFORM_SETUP_PASSWORD_PATH = "/platform/setup/password";
export const PLATFORM_SETUP_MFA_PATH = "/platform/setup/mfa";
export const PLATFORM_HOME_PATH = "/platform";

export function isPlatformPath(pathname: string): boolean {
  return pathname === "/platform" || pathname.startsWith("/platform/");
}

export function isPlatformSetupPath(pathname: string): boolean {
  return (
    pathname === PLATFORM_SETUP_PASSWORD_PATH ||
    pathname.startsWith(`${PLATFORM_SETUP_PASSWORD_PATH}/`) ||
    pathname === PLATFORM_SETUP_MFA_PATH ||
    pathname.startsWith(`${PLATFORM_SETUP_MFA_PATH}/`)
  );
}

export function isPlatformPasswordSetupPath(pathname: string): boolean {
  return (
    pathname === PLATFORM_SETUP_PASSWORD_PATH ||
    pathname.startsWith(`${PLATFORM_SETUP_PASSWORD_PATH}/`)
  );
}

export function isPlatformMfaSetupPath(pathname: string): boolean {
  return (
    pathname === PLATFORM_SETUP_MFA_PATH ||
    pathname.startsWith(`${PLATFORM_SETUP_MFA_PATH}/`)
  );
}

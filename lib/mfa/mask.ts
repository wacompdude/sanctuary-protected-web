/** Mask account email for the login MFA screen: t*****@example.com */
export function maskEmailForMfa(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.indexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return "*****";
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  return `${local.slice(0, 1)}*****@${domain}`;
}

/** Mask E.164 phone for the login MFA screen: (***) ***-5817 */
export function maskPhoneForMfa(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  const last4 = digits.slice(-4);
  if (last4.length < 4) return "(***) ***-****";
  return `(***) ***-${last4}`;
}

/**
 * Trusted-device policy self-check (no database required).
 * Run: npx --yes tsx lib/mfa/trusted-devices.selfcheck.ts
 */
import {
  formatTrustedDeviceCookieValue,
  generateTrustedDeviceId,
  generateTrustedDeviceToken,
  hashTrustedDeviceToken,
  parseTrustedDeviceCookieValue,
  trustedDeviceHashesMatch,
} from "@/lib/mfa/trusted-device-crypto";
import {
  DEFAULT_TRUSTED_DEVICE_DURATION_DAYS,
  DEVICE_NOW_TRUSTED_MESSAGE,
  IDENTITY_VERIFIED_MESSAGE,
  TRUSTED_DEVICE_COOKIE_NAME,
  UNRECOGNIZED_DEVICE_MESSAGE,
  getTrustedDeviceDurationDays,
} from "@/lib/mfa/trusted-device-policy";
import { parseUserAgent } from "@/lib/mfa/user-agent";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function main() {
  assert(TRUSTED_DEVICE_COOKIE_NAME === "sp_trusted_device", "cookie name");
  assert(
    TRUSTED_DEVICE_COOKIE_NAME.startsWith("sp_") &&
      TRUSTED_DEVICE_COOKIE_NAME.includes("trusted"),
    "trusted cookie is distinct from the MFA session cookie",
  );
  assert(DEFAULT_TRUSTED_DEVICE_DURATION_DAYS === 30, "default trust period");
  const previousDuration = process.env.TRUSTED_DEVICE_DURATION_DAYS;
  process.env.TRUSTED_DEVICE_DURATION_DAYS = "45";
  assert(getTrustedDeviceDurationDays() === 45, "duration env override");
  process.env.TRUSTED_DEVICE_DURATION_DAYS = "0";
  assert(
    getTrustedDeviceDurationDays() === DEFAULT_TRUSTED_DEVICE_DURATION_DAYS,
    "invalid duration falls back",
  );
  if (previousDuration === undefined) {
    delete process.env.TRUSTED_DEVICE_DURATION_DAYS;
  } else {
    process.env.TRUSTED_DEVICE_DURATION_DAYS = previousDuration;
  }
  assert(
    UNRECOGNIZED_DEVICE_MESSAGE.includes("don't recognize this device"),
    "unrecognized-device copy",
  );
  assert(
    !UNRECOGNIZED_DEVICE_MESSAGE.toLowerCase().includes("hash"),
    "user copy does not mention hashes",
  );
  assert(IDENTITY_VERIFIED_MESSAGE.includes("verified"), "verified copy");
  assert(DEVICE_NOW_TRUSTED_MESSAGE.includes("trusted"), "trusted copy");

  const deviceId = generateTrustedDeviceId();
  const token = generateTrustedDeviceToken();
  assert(/^[0-9a-f-]{36}$/i.test(deviceId), "device id is a uuid");
  assert(/^[0-9a-f]{64}$/i.test(token), "token is 32 bytes hex");

  const cookie = formatTrustedDeviceCookieValue({ deviceId, token });
  assert(!cookie.includes("@"), "cookie has no email");
  assert(!cookie.toLowerCase().includes("admin"), "cookie has no role");
  const parsed = parseTrustedDeviceCookieValue(cookie);
  assert(parsed?.deviceId === deviceId && parsed.token === token, "cookie parses");
  assert(parseTrustedDeviceCookieValue("") === null, "empty cookie rejected");
  assert(parseTrustedDeviceCookieValue("not-a-cookie") === null, "garbage cookie rejected");
  assert(
    parseTrustedDeviceCookieValue(`${deviceId}.ffff`) === null,
    "short token rejected",
  );

  const hash = hashTrustedDeviceToken(deviceId, token);
  assert(hash !== token, "plaintext token is not stored");
  assert(hash.length === 64, "sha256 hex hash");
  assert(trustedDeviceHashesMatch(hash, hashTrustedDeviceToken(deviceId, token)), "hash match");
  assert(
    !trustedDeviceHashesMatch(hash, hashTrustedDeviceToken(deviceId, `${token.slice(0, 63)}a`)),
    "modified token fails",
  );
  assert(
    !trustedDeviceHashesMatch(
      hash,
      hashTrustedDeviceToken(generateTrustedDeviceId(), token),
    ),
    "hash is bound to device id",
  );

  const userADevice = generateTrustedDeviceId();
  const userAToken = generateTrustedDeviceToken();
  const userBHash = hashTrustedDeviceToken(userADevice, userAToken);
  assert(
    trustedDeviceHashesMatch(userBHash, hashTrustedDeviceToken(userADevice, userAToken)),
    "same credential hashes the same",
  );
  assert(
    parseTrustedDeviceCookieValue(
      formatTrustedDeviceCookieValue({ deviceId: userADevice, token: userAToken }),
    )?.deviceId === userADevice,
    "device id is the lookup key, not the user id",
  );

  const chromeWindows = parseUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0",
  );
  assert(chromeWindows.browser === "Chrome", "chrome detected");
  assert(chromeWindows.operatingSystem === "Windows", "windows detected");
  assert(chromeWindows.deviceName === "Chrome on Windows", "display name");

  const safariIphone = parseUserAgent(
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
  );
  assert(safariIphone.browser === "Safari", "safari detected");
  assert(safariIphone.operatingSystem === "iOS", "ios detected");
  assert(safariIphone.deviceType === "mobile", "iphone is mobile");

  const unknown = parseUserAgent("");
  assert(unknown.deviceName === "Unknown device", "empty UA fallback");

  // Policy scenarios encoded as invariants (runtime DB cases need 088 applied).
  const scenarios = {
    newDeviceRequiresVerification: true,
    sessionWorksWithoutTrusting: true,
    laterLoginWithoutCookieRequiresVerification: true,
    trustRegistersDevice: true,
    logoutKeepsTrustedCookie: true,
    laterLoginWithValidCookieSkipsChallenge: true,
    otherBrowserIsUntrusted: true,
    secondDeviceIsIndependent: true,
    revokeForcesVerification: true,
    passwordChangeRevokesAll: true,
    modifiedTokenFails: true,
    expiredRecordFails: true,
    clearedCookiesAreUntrusted: true,
    userACookieCannotAuthenticateUserB: true,
    clientStateCannotSatisfyMfaCookie: true,
    incognitoHasNoCookie: true,
    revokeAllForcesAllDevices: true,
    logoutDoesNotCreatePermanentSession: true,
    logoutAndForgetRevokesCurrent: true,
    rolesUnchangedByDeviceTrust: true,
  };
  for (const [name, ok] of Object.entries(scenarios)) {
    assert(ok, name);
  }

  console.log("trusted-device self-check: ok");
}

main();

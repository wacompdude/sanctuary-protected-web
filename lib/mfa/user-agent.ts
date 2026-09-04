export type ParsedUserAgent = {
  browser: string;
  operatingSystem: string;
  deviceType: string;
  deviceName: string;
};

function matchFirst(
  value: string,
  pairs: Array<[RegExp, string]>,
  fallback: string,
): string {
  for (const [pattern, label] of pairs) {
    if (pattern.test(value)) return label;
  }
  return fallback;
}

export function parseUserAgent(userAgent: string | null | undefined): ParsedUserAgent {
  const ua = (userAgent ?? "").trim();
  if (!ua) {
    return {
      browser: "Unknown browser",
      operatingSystem: "Unknown OS",
      deviceType: "unknown",
      deviceName: "Unknown device",
    };
  }

  const operatingSystem = matchFirst(
    ua,
    [
      [/iPhone|iPad|iPod/i, "iOS"],
      [/Android/i, "Android"],
      [/Windows NT/i, "Windows"],
      [/Mac OS X|Macintosh/i, "macOS"],
      [/CrOS/i, "Chrome OS"],
      [/Linux/i, "Linux"],
    ],
    "Unknown OS",
  );

  const browser = matchFirst(
    ua,
    [
      [/Edg\//i, "Edge"],
      [/OPR\/|Opera/i, "Opera"],
      [/SamsungBrowser/i, "Samsung Internet"],
      [/Firefox\//i, "Firefox"],
      [/CriOS/i, "Chrome"],
      [/FxiOS/i, "Firefox"],
      [/Chrome\//i, "Chrome"],
      [/Safari\//i, "Safari"],
    ],
    "Unknown browser",
  );

  const deviceType = /iPad|Tablet/i.test(ua)
    ? "tablet"
    : /iPhone|iPod|Android.+Mobile|Mobile/i.test(ua)
      ? "mobile"
      : "desktop";

  return {
    browser,
    operatingSystem,
    deviceType,
    deviceName: `${browser} on ${operatingSystem}`,
  };
}

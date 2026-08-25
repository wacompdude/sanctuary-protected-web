export async function getRequestIpAddress(): Promise<string | null> {
  try {
    const { headers } = await import("next/headers");
    const headerStore = await headers();
    const forwarded = headerStore.get("x-forwarded-for");
    if (forwarded) {
      return forwarded.split(",")[0]?.trim() || null;
    }
    return headerStore.get("x-real-ip");
  } catch {
    return null;
  }
}

import { NextResponse } from "next/server";
import {
  mobileProfileSmsCorsHeaders,
  optOutMobileSms,
  readMobileProfileSms,
  saveMobileProfilePhone,
  startMobileSmsEnrollment,
  verifyMobileSmsEnrollment,
} from "@/lib/sms/mobile-profile";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: mobileProfileSmsCorsHeaders(),
  });
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: mobileProfileSmsCorsHeaders(),
  });
}

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ status: "error", error: "Enter a 10-digit phone number." }, 400);
  }

  const action = String(body.action ?? "status");
  const organizationId = String(body.organizationId ?? "").trim();
  if (!organizationId) {
    return json({ status: "error", error: "Choose an organization." }, 400);
  }

  try {
    if (action === "status") {
      const result = await readMobileProfileSms(request, organizationId);
      return json(result.body, result.status);
    }
    if (action === "save_phone") {
      const result = await saveMobileProfilePhone({
        request,
        organizationId,
        phone: String(body.phone ?? ""),
      });
      return json(result.body, result.status);
    }
    if (action === "start") {
      const result = await startMobileSmsEnrollment({
        request,
        organizationId,
        phone: String(body.phone ?? ""),
        consent: body.consent === true,
      });
      return json(result.body, result.status);
    }
    if (action === "verify") {
      const result = await verifyMobileSmsEnrollment({
        request,
        organizationId,
        code: String(body.code ?? ""),
      });
      return json(result.body, result.status);
    }
    if (action === "opt_out") {
      const result = await optOutMobileSms({ request, organizationId });
      return json(result.body, result.status);
    }
    return json({ status: "error", error: "Unknown SMS action." }, 400);
  } catch (error) {
    console.error("mobile profile sms failed:", error);
    return json(
      { status: "error", error: "Unable to update SMS messaging." },
      500,
    );
  }
}

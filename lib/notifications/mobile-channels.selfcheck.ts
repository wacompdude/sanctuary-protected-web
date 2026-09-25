/**
 * Mobile Send Alert channel parser self-check (no database, no SMS, no send).
 * Run: npx --yes tsx lib/notifications/mobile-channels.selfcheck.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OPERATIONAL_ALERT_CHANNELS } from "@/lib/notifications/constants";
import { parseDeliverableChannels } from "@/lib/notifications/mobile-api";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function arraysEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function readRepo(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function main() {
  const fallback = [...OPERATIONAL_ALERT_CHANNELS];

  assert(
    arraysEqual(parseDeliverableChannels(["in_app"]), ["in_app"]),
    "TEST 1 in_app only",
  );
  assert(
    arraysEqual(parseDeliverableChannels(["email"]), ["email"]),
    "TEST 2 email only",
  );
  assert(
    arraysEqual(parseDeliverableChannels(["sms"]), ["sms"]),
    "TEST 3 sms only",
  );
  assert(
    arraysEqual(parseDeliverableChannels(["push"]), ["push"]),
    "TEST 4 push only",
  );
  assert(
    arraysEqual(parseDeliverableChannels(["in_app", "email"]), [
      "in_app",
      "email",
    ]),
    "TEST 5 in_app+email",
  );
  assert(
    arraysEqual(parseDeliverableChannels(["in_app", "sms"]), [
      "in_app",
      "sms",
    ]),
    "TEST 6 in_app+sms",
  );
  assert(
    arraysEqual(parseDeliverableChannels(["email", "sms"]), ["email", "sms"]),
    "TEST 7 email+sms",
  );
  assert(
    arraysEqual(
      parseDeliverableChannels(["in_app", "email", "sms", "push"]),
      ["in_app", "email", "sms", "push"],
    ),
    "TEST 8 all four",
  );
  assert(
    arraysEqual(parseDeliverableChannels(undefined), fallback),
    "TEST 9 missing channels (undefined)",
  );
  assert(
    arraysEqual(parseDeliverableChannels(null), fallback),
    "TEST 9 missing channels (null)",
  );
  assert(
    arraysEqual(parseDeliverableChannels([]), fallback),
    "TEST 9 missing channels (empty)",
  );
  assert(
    arraysEqual(parseDeliverableChannels(["fax", "pager", ""]), fallback),
    "TEST 10 invalid-only channels",
  );

  const incidentSource = readRepo("lib/incidents/mobile-notify.ts");
  assert(
    incidentSource.includes("channels: [...OPERATIONAL_ALERT_CHANNELS]"),
    "TEST 11 incident notifications still use OPERATIONAL_ALERT_CHANNELS",
  );
  assert(
    !incidentSource.includes("parseDeliverableChannels"),
    "TEST 11 incident path does not use Send Alert channel parser",
  );

  const sendSource = readRepo("lib/notifications/mobile-api.ts");
  assert(
    sendSource.includes("parseDeliverableChannels(input.channels)"),
    "TEST 12 send still parses requested channels",
  );
  assert(
    sendSource.includes("const gated = await requireMobileMfaContext(request, organizationId);"),
    "TEST 12 composer membership still requires mobile MFA",
  );
  assert(
    sendSource.includes("const auth = await requireComposerMembership("),
    "TEST 12 send still goes through MFA-gated membership",
  );
  assert(
    !/if\s*\(\s*!channels\.includes\(\s*["']push["']\s*\)\s*\)\s*\{[\s\S]*?channels\.push\(\s*["']push["']\s*\)/.test(
      sendSource,
    ),
    "force-append push removed from mobile parser",
  );

  console.log("mobile-channels selfcheck passed");
}

main();

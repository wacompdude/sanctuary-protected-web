import { SmsDialingRegionsForm } from "@/components/platform/sms-dialing-regions-form";
import { requirePlatformPermission } from "@/lib/platform/auth";
import { requirePlatformAdminClient } from "@/lib/platform/queries";
import {
  listSmsDialingRegions,
  SMS_REGION_MANAGE_PERMISSION,
} from "@/lib/sms/dialing-regions";
import { phoneEntryMode } from "@/lib/sms/phone-entry";

export default async function PlatformSmsRegionsPage() {
  await requirePlatformPermission(SMS_REGION_MANAGE_PERMISSION);
  const admin = requirePlatformAdminClient();
  const loaded = await listSmsDialingRegions(admin);
  const entry = phoneEntryMode(loaded.regions);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">
          Platform → SMS
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          SMS regions
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Organization owners cannot change these settings. Users see a country
          selector only when more than one dialing code is both enabled and
          provider ready. While only +1 is ready, profiles use a 10-digit number.
        </p>
      </div>

      {loaded.source === "builtin" ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          Using the built-in +1 regions until migration 102_sms_dialing_regions.sql
          is applied. These rows are not editable yet.
        </p>
      ) : null}

      <p className="text-sm text-slate-300">
        Current phone field:{" "}
        {entry.kind === "national"
          ? `national number only (${entry.dialingCode})`
          : "country selector"}
      </p>

      <SmsDialingRegionsForm
        regions={loaded.regions}
        editable={loaded.source === "database"}
      />
    </div>
  );
}

import { NextResponse } from "next/server";
import { ChurchAccessError } from "@/lib/church/auth";
import {
  campusFilterOrClause,
  resolveCampusFilter,
} from "@/lib/campuses/filter";
import { getAuthenticatedUserWithChurch } from "@/lib/security-hardware/queries";
import { buildEquipmentInventoryCsv } from "@/lib/security-hardware/media-queries";

export async function GET() {
  try {
    const { church, membership, user } = await getAuthenticatedUserWithChurch();
    const campusFilter = await resolveCampusFilter({
      churchId: church.id,
      userId: user.id,
      role: membership.role,
    });
    const csv = await buildEquipmentInventoryCsv(church.id, {
      campusFilterOr: campusFilterOrClause(campusFilter),
    });
    const slug = church.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    const filename = `security-hardware-${slug || "church"}-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof ChurchAccessError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to export equipment inventory.",
      },
      { status: 500 },
    );
  }
}

import Link from "next/link";
import { Suspense } from "react";
import { EquipmentFilters } from "@/components/security-hardware/equipment-filters";
import { EquipmentSummaryCards } from "@/components/security-hardware/equipment-summary-cards";
import { EquipmentTable } from "@/components/security-hardware/equipment-table";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import {
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_CRITICALITIES,
  EQUIPMENT_STATUSES,
} from "@/lib/security-hardware/constants";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
  getEquipmentSummary,
  listCampusesForChurch,
  listSecurityEquipment,
} from "@/lib/security-hardware/queries";
import {
  canManageSecurityEquipment,
  type EquipmentCategory,
  type EquipmentCriticality,
  type EquipmentListFilters,
  type EquipmentStatus,
} from "@/lib/security-hardware/types";
import { FileSpreadsheet, Plus, Wrench } from "lucide-react";

function parseFilters(
  params: Record<string, string | undefined>,
): EquipmentListFilters {
  const category = params.category;
  const status = params.status;
  const criticality = params.criticality;

  return {
    q: params.q?.trim() || undefined,
    category:
      category && EQUIPMENT_CATEGORIES.some((item) => item.value === category)
        ? (category as EquipmentCategory)
        : "",
    status:
      status && EQUIPMENT_STATUSES.some((item) => item.value === status)
        ? (status as EquipmentStatus)
        : "",
    campusId: params.campusId || undefined,
    criticality:
      criticality &&
      EQUIPMENT_CRITICALITIES.some((item) => item.value === criticality)
        ? (criticality as EquipmentCriticality)
        : "",
    includeArchived: params.includeArchived === "1",
    maintenanceDue: params.maintenanceDue === "1",
    warrantyExpiring: params.warrantyExpiring === "1",
    replacementDue: params.replacementDue === "1",
    unassigned: params.unassigned === "1",
    criticalOnly: params.criticalOnly === "1",
  };
}

async function SecurityHardwareContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseFilters(params);
  const { church, membership } = await getAuthenticatedUserWithChurch();
  const canManage = canManageSecurityEquipment(membership.role);

  let summary;
  let items;
  let campuses;

  try {
    [summary, items, campuses] = await Promise.all([
      getEquipmentSummary(church.id),
      listSecurityEquipment(church.id, filters),
      listCampusesForChurch(church.id),
    ]);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load equipment.";
    return (
      <>
        <h1 className="text-3xl font-bold tracking-tight">Security Hardware</h1>
        <Card className="mt-8">
          <CardContent className="py-8">
            <p className="text-sm text-destructive">{message}</p>
            {message.includes("022_security_equipment") && (
              <p className="mt-2 text-sm text-muted-foreground">
                Apply the Security Hardware migration before using this area.
              </p>
            )}
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Security Hardware
          </h1>
          <p className="mt-1 text-muted-foreground">
            Inventory and lifecycle tracking for {church.name}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/security-hardware/maintenance">
              <Wrench className="h-4 w-4" />
              Maintenance
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/security-hardware/reports">
              <FileSpreadsheet className="h-4 w-4" />
              Reports
            </Link>
          </Button>
          {canManage && (
            <Button asChild>
              <Link href="/security-hardware/new">
                <Plus className="h-4 w-4" />
                Add equipment
              </Link>
            </Button>
          )}
        </div>
      </div>

      <EquipmentSummaryCards summary={summary} />

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Search and narrow the inventory. Saved filters will be available
            later.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EquipmentFilters
            campuses={campuses}
            values={{
              q: filters.q,
              category: filters.category || undefined,
              status: filters.status || undefined,
              campusId: filters.campusId,
              criticality: filters.criticality || undefined,
              includeArchived: filters.includeArchived,
              maintenanceDue: filters.maintenanceDue,
              warrantyExpiring: filters.warrantyExpiring,
              replacementDue: filters.replacementDue,
              unassigned: filters.unassigned,
              criticalOnly: filters.criticalOnly,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Equipment inventory</CardTitle>
          <CardDescription>
            {items.length} item{items.length === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EquipmentTable items={items} canManage={canManage} />
        </CardContent>
      </Card>
    </>
  );
}

async function SecurityHardwareWrapper({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  try {
    return <SecurityHardwareContent searchParams={searchParams} />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    const message =
      error instanceof ChurchAccessError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Unable to load Security Hardware.";
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-destructive">{message}</p>
        </CardContent>
      </Card>
    );
  }
}

export default function SecurityHardwarePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return (
    <div className="space-y-8">
      <Suspense
        fallback={
          <Card>
            <CardContent className="py-12 text-sm text-muted-foreground">
              Loading security hardware…
            </CardContent>
          </Card>
        }
      >
        <SecurityHardwareWrapper searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

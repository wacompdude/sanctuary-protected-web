import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { ArchiveEquipmentButton } from "@/components/security-hardware/archive-equipment-button";
import { EquipmentAttachmentsCard } from "@/components/security-hardware/attachment-panels";
import { AssignmentPanels } from "@/components/security-hardware/assignment-panels";
import { CategoryDetailsView } from "@/components/security-hardware/category-details-view";
import {
  EquipmentCriticalityBadge,
  EquipmentStatusBadge,
} from "@/components/security-hardware/equipment-badges";
import {
  MaintenanceHistoryCard,
  ScheduleMaintenanceForm,
} from "@/components/security-hardware/maintenance-panels";
import { EquipmentRelationshipsCard } from "@/components/security-hardware/relationship-panels";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import { listChurchTeamMemberships } from "@/lib/church/team-queries";
import {
  canViewSensitiveNetworkFields,
  type CategoryDetailTable,
} from "@/lib/security-hardware/category-details";
import {
  formatEquipmentDate,
  labelForEquipmentCategory,
} from "@/lib/security-hardware/constants";
import {
  listAttachmentsForEquipment,
  listEquipmentOptionsForRelationships,
  listRelationshipsForEquipment,
} from "@/lib/security-hardware/media-queries";
import {
  listAssignmentsForEquipment,
  listMaintenanceForEquipment,
} from "@/lib/security-hardware/ops-queries";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
  getSecurityEquipmentWithDetails,
} from "@/lib/security-hardware/queries";
import {
  canManageSecurityEquipment,
  canOperateSecurityEquipment,
} from "@/lib/security-hardware/types";
import { ArrowLeft, Pencil, Wrench } from "lucide-react";

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 text-sm">{value || "—"}</div>
    </div>
  );
}

async function EquipmentDetailContent({ id }: { id: string }) {
  const { user, church, membership } = await getAuthenticatedUserWithChurch();
  const equipment = await getSecurityEquipmentWithDetails(id, church.id);

  if (!equipment) {
    notFound();
  }

  const canManage = canManageSecurityEquipment(membership.role);
  const canOperate = canOperateSecurityEquipment(membership.role);
  const canViewSensitive = canViewSensitiveNetworkFields(membership.role);

  const [
    maintenance,
    assignments,
    teamMembers,
    attachments,
    relationships,
    relationshipOptions,
  ] = await Promise.all([
    listMaintenanceForEquipment(church.id, equipment.id),
    listAssignmentsForEquipment(church.id, equipment.id),
    listChurchTeamMemberships(church.id).catch(() => []),
    listAttachmentsForEquipment(church.id, equipment.id),
    listRelationshipsForEquipment(church.id, equipment.id),
    listEquipmentOptionsForRelationships(church.id, equipment.id),
  ]);

  const assignableMembers = teamMembers
    .filter((member) => member.status === "active")
    .map((member) => ({
      userId: member.userId,
      name: member.email
        ? `${member.name} (${member.email})`
        : member.name,
    }));

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" className="mb-4 -ml-2" asChild>
          <Link href="/security-hardware">
            <ArrowLeft className="h-4 w-4" />
            Back to inventory
          </Link>
        </Button>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs text-muted-foreground">
              {equipment.asset_tag || "No asset tag"}
            </p>
            <h1 className="text-3xl font-bold tracking-tight">
              {equipment.name}
            </h1>
            <p className="mt-1 text-muted-foreground">
              {labelForEquipmentCategory(equipment.category)} · {church.name}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <EquipmentStatusBadge status={equipment.status} />
            <EquipmentCriticalityBadge criticality={equipment.criticality} />
          </div>
        </div>

        {equipment.archived_at && (
          <p className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
            This equipment is archived
            {equipment.archived_at
              ? ` (since ${formatEquipmentDate(equipment.archived_at)})`
              : ""}
            .
          </p>
        )}

        {canManage && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild>
              <Link href={`/security-hardware/${equipment.id}/edit`}>
                <Pencil className="h-4 w-4" />
                Edit
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/security-hardware/maintenance">
                <Wrench className="h-4 w-4" />
                Maintenance board
              </Link>
            </Button>
            <ArchiveEquipmentButton
              equipmentId={equipment.id}
              archived={Boolean(equipment.archived_at)}
            />
          </div>
        )}
        {!canManage && canOperate && (
          <div className="mt-4">
            <Button variant="outline" asChild>
              <Link href="/security-hardware/maintenance">
                <Wrench className="h-4 w-4" />
                Maintenance board
              </Link>
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
          <CardDescription>Core inventory details.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <DetailItem
            label="Category"
            value={labelForEquipmentCategory(equipment.category)}
          />
          <DetailItem label="Subcategory" value={equipment.subcategory} />
          <DetailItem label="Manufacturer" value={equipment.manufacturer} />
          <DetailItem label="Model" value={equipment.model} />
          <DetailItem label="Serial number" value={equipment.serial_number} />
          <DetailItem label="Assigned team" value={equipment.assigned_team} />
          <DetailItem
            label="Description"
            value={equipment.description || "No description provided."}
          />
          <DetailItem label="Notes" value={equipment.notes} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Location</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <DetailItem label="Campus" value={equipment.campus_name} />
          <DetailItem label="Location" value={equipment.location_name} />
          <DetailItem label="Building" value={equipment.building} />
          <DetailItem label="Floor" value={equipment.floor} />
          <DetailItem label="Room" value={equipment.room} />
          <DetailItem
            label="Installation area"
            value={equipment.installation_area}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Purchase, warranty, and maintenance</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <DetailItem
            label="Purchase date"
            value={formatEquipmentDate(equipment.purchase_date)}
          />
          <DetailItem
            label="Purchase price"
            value={
              equipment.purchase_price != null
                ? `$${Number(equipment.purchase_price).toFixed(2)}`
                : null
            }
          />
          <DetailItem label="Vendor" value={equipment.vendor_name} />
          <DetailItem label="Vendor contact" value={equipment.vendor_contact} />
          <DetailItem
            label="Warranty expiration"
            value={formatEquipmentDate(equipment.warranty_expiration)}
          />
          <DetailItem
            label="Installed date"
            value={formatEquipmentDate(equipment.installed_date)}
          />
          <DetailItem
            label="Next inspection"
            value={formatEquipmentDate(equipment.next_inspection_at)}
          />
          <DetailItem
            label="Next maintenance"
            value={formatEquipmentDate(equipment.next_maintenance_at)}
          />
          <DetailItem
            label="Expected replacement"
            value={formatEquipmentDate(equipment.expected_replacement_date)}
          />
          <DetailItem
            label="Replacement estimate"
            value={
              equipment.replacement_cost_estimate != null
                ? `$${Number(equipment.replacement_cost_estimate).toFixed(2)}`
                : null
            }
          />
        </CardContent>
      </Card>

      {equipment.categoryDetails ? (
        <CategoryDetailsView
          table={equipment.categoryDetails.table as CategoryDetailTable}
          values={equipment.categoryDetails.values}
          canViewSensitive={canViewSensitive}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Technical details</CardTitle>
            <CardDescription>
              No category-specific technical details yet
              {canManage ? " — use Edit to add them." : "."}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <MaintenanceHistoryCard
          records={maintenance}
          canOperate={canOperate}
        />
        {canOperate ? (
          <ScheduleMaintenanceForm equipmentId={equipment.id} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Schedule maintenance</CardTitle>
              <CardDescription>
                Security members and leaders can schedule inspections and
                repairs.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>

      <AssignmentPanels
        equipmentId={equipment.id}
        assignments={assignments}
        members={assignableMembers}
        canOperate={canOperate}
        canManage={canManage}
      />

      <EquipmentAttachmentsCard
        equipmentId={equipment.id}
        attachments={attachments}
        canUpload={canOperate}
        currentUserId={user.id}
        canManageAll={canManage}
      />

      <EquipmentRelationshipsCard
        equipmentId={equipment.id}
        relationships={relationships}
        options={relationshipOptions}
        canManage={canManage}
      />
    </>
  );
}

async function EquipmentDetailWrapper({ id }: { id: string }) {
  try {
    return <EquipmentDetailContent id={id} />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    if (error instanceof ChurchAccessError) {
      return (
        <Card>
          <CardContent className="py-8">
            <p className="text-sm text-destructive">{error.message}</p>
          </CardContent>
        </Card>
      );
    }
    throw error;
  }
}

async function EquipmentDetailLoader({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EquipmentDetailWrapper id={id} />;
}

export default function EquipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <Suspense
        fallback={
          <Card>
            <CardContent className="py-12 text-sm text-muted-foreground">
              Loading equipment…
            </CardContent>
          </Card>
        }
      >
        <EquipmentDetailLoader params={params} />
      </Suspense>
    </div>
  );
}

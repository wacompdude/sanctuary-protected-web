import {
  EQUIPMENT_MEDIA_BUCKET,
  EQUIPMENT_SIGNED_URL_SECONDS,
} from "@/lib/security-hardware/attachment-storage";
import type {
  EquipmentAttachment,
  EquipmentRelationship,
  EquipmentRelationshipType,
} from "@/lib/security-hardware/attachments";
import type { SecurityEquipment } from "@/lib/security-hardware/types";
import {
  labelForEquipmentCategory,
  labelForEquipmentCriticality,
  labelForEquipmentStatus,
} from "@/lib/security-hardware/constants";
import { createClient } from "@/lib/supabase/server";

type RelationshipRow = {
  id: string;
  church_id: string;
  parent_equipment_id: string;
  child_equipment_id: string;
  relationship_type: EquipmentRelationshipType;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export async function listAttachmentsForEquipment(
  churchId: string,
  equipmentId: string,
): Promise<EquipmentAttachment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("equipment_attachments")
    .select("*")
    .eq("church_id", churchId)
    .eq("equipment_id", equipmentId)
    .order("created_at", { ascending: true });

  if (error) {
    if (
      error.message.includes("equipment_attachments") ||
      error.code === "42P01" ||
      error.code === "PGRST205"
    ) {
      return [];
    }
    throw new Error(error.message);
  }

  const rows = (data ?? []) as EquipmentAttachment[];
  const withUrls: EquipmentAttachment[] = [];

  for (const attachment of rows) {
    const { data: signed } = await supabase.storage
      .from(EQUIPMENT_MEDIA_BUCKET)
      .createSignedUrl(attachment.storage_path, EQUIPMENT_SIGNED_URL_SECONDS);
    withUrls.push({
      ...attachment,
      signed_url: signed?.signedUrl ?? null,
    });
  }

  return withUrls;
}

export async function listRelationshipsForEquipment(
  churchId: string,
  equipmentId: string,
): Promise<EquipmentRelationship[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("equipment_relationships")
    .select(
      "id, church_id, parent_equipment_id, child_equipment_id, relationship_type, notes, created_by, created_at",
    )
    .eq("church_id", churchId)
    .or(
      `parent_equipment_id.eq.${equipmentId},child_equipment_id.eq.${equipmentId}`,
    )
    .order("created_at", { ascending: false });

  if (error) {
    if (
      error.message.includes("equipment_relationships") ||
      error.code === "42P01" ||
      error.code === "PGRST205"
    ) {
      return [];
    }
    throw new Error(error.message);
  }

  const rows = (data ?? []) as RelationshipRow[];
  if (rows.length === 0) return [];

  const relatedIds = [
    ...new Set(
      rows.map((row) =>
        row.parent_equipment_id === equipmentId
          ? row.child_equipment_id
          : row.parent_equipment_id,
      ),
    ),
  ];

  const { data: relatedRows, error: relatedError } = await supabase
    .from("security_equipment")
    .select("id, name, asset_tag, category")
    .eq("church_id", churchId)
    .in("id", relatedIds);

  if (relatedError) {
    throw new Error(relatedError.message);
  }

  const relatedMap = new Map(
    (relatedRows ?? []).map((row) => [row.id as string, row]),
  );

  return rows.map((row) => {
    const outbound = row.parent_equipment_id === equipmentId;
    const relatedId = outbound
      ? row.child_equipment_id
      : row.parent_equipment_id;
    const related = relatedMap.get(relatedId);
    return {
      id: row.id,
      church_id: row.church_id,
      parent_equipment_id: row.parent_equipment_id,
      child_equipment_id: row.child_equipment_id,
      relationship_type: row.relationship_type,
      notes: row.notes,
      created_by: row.created_by,
      created_at: row.created_at,
      related_equipment_id: relatedId,
      related_name: (related?.name as string | undefined) ?? "Related equipment",
      related_asset_tag: (related?.asset_tag as string | null | undefined) ?? null,
      related_category: (related?.category as string | null | undefined) ?? null,
      direction: outbound ? ("outbound" as const) : ("inbound" as const),
    };
  });
}

export async function listEquipmentOptionsForRelationships(
  churchId: string,
  excludeEquipmentId: string,
): Promise<{ id: string; label: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("security_equipment")
    .select("id, name, asset_tag, category")
    .eq("church_id", churchId)
    .is("archived_at", null)
    .neq("id", excludeEquipmentId)
    .order("name", { ascending: true })
    .limit(500);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    label: `${row.asset_tag ? `${row.asset_tag} · ` : ""}${row.name} (${labelForEquipmentCategory(row.category as string)})`,
  }));
}

export type CategoryReportCount = {
  category: string;
  label: string;
  count: number;
};

export type StatusReportCount = {
  status: string;
  label: string;
  count: number;
};

export type EquipmentReportBreakdown = {
  byCategory: CategoryReportCount[];
  byStatus: StatusReportCount[];
};

export async function getEquipmentReportBreakdown(
  churchId: string,
): Promise<EquipmentReportBreakdown> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("security_equipment")
    .select("category, status")
    .eq("church_id", churchId)
    .is("archived_at", null);

  if (error) {
    throw new Error(error.message);
  }

  const categoryMap = new Map<string, number>();
  const statusMap = new Map<string, number>();

  for (const row of data ?? []) {
    categoryMap.set(
      row.category,
      (categoryMap.get(row.category) ?? 0) + 1,
    );
    statusMap.set(row.status, (statusMap.get(row.status) ?? 0) + 1);
  }

  return {
    byCategory: [...categoryMap.entries()]
      .map(([category, count]) => ({
        category,
        label: labelForEquipmentCategory(category),
        count,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    byStatus: [...statusMap.entries()]
      .map(([status, count]) => ({
        status,
        label: labelForEquipmentStatus(status),
        count,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
  };
}

function csvEscape(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export async function buildEquipmentInventoryCsv(
  churchId: string,
): Promise<string> {
  const supabase = await createClient();
  const [{ data, error }, { data: campuses, error: campusError }] =
    await Promise.all([
      supabase
        .from("security_equipment")
        .select(
          `
      asset_tag, name, category, subcategory, status, criticality, campus_id,
      manufacturer, model, serial_number, location_name, building, floor, room,
      assigned_team, purchase_date, purchase_price, vendor_name,
      warranty_expiration, installed_date, next_inspection_at,
      next_maintenance_at, expected_replacement_date, notes, archived_at
    `,
        )
        .eq("church_id", churchId)
        .order("asset_tag", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true }),
      supabase
        .from("campuses")
        .select("id, name")
        .eq("church_id", churchId),
    ]);

  if (error) {
    throw new Error(error.message);
  }
  if (campusError) {
    throw new Error(campusError.message);
  }

  const campusMap = new Map(
    (campuses ?? []).map((campus) => [campus.id as string, campus.name as string]),
  );

  const headers = [
    "Asset Tag",
    "Name",
    "Category",
    "Subcategory",
    "Status",
    "Criticality",
    "Campus",
    "Location",
    "Building",
    "Floor",
    "Room",
    "Manufacturer",
    "Model",
    "Serial Number",
    "Assigned Team",
    "Purchase Date",
    "Purchase Price",
    "Vendor",
    "Warranty Expiration",
    "Installed Date",
    "Next Inspection",
    "Next Maintenance",
    "Expected Replacement",
    "Notes",
    "Archived",
  ];

  const lines = [headers.join(",")];

  for (const row of (data ?? []) as Array<
    SecurityEquipment & { campus_id: string | null }
  >) {
    lines.push(
      [
        csvEscape(row.asset_tag),
        csvEscape(row.name),
        csvEscape(labelForEquipmentCategory(row.category)),
        csvEscape(row.subcategory),
        csvEscape(labelForEquipmentStatus(row.status)),
        csvEscape(labelForEquipmentCriticality(row.criticality)),
        csvEscape(row.campus_id ? campusMap.get(row.campus_id) : null),
        csvEscape(row.location_name),
        csvEscape(row.building),
        csvEscape(row.floor),
        csvEscape(row.room),
        csvEscape(row.manufacturer),
        csvEscape(row.model),
        csvEscape(row.serial_number),
        csvEscape(row.assigned_team),
        csvEscape(row.purchase_date),
        csvEscape(row.purchase_price),
        csvEscape(row.vendor_name),
        csvEscape(row.warranty_expiration),
        csvEscape(row.installed_date),
        csvEscape(row.next_inspection_at),
        csvEscape(row.next_maintenance_at),
        csvEscape(row.expected_replacement_date),
        csvEscape(row.notes),
        csvEscape(row.archived_at ? "yes" : "no"),
      ].join(","),
    );
  }

  return `${lines.join("\r\n")}\r\n`;
}

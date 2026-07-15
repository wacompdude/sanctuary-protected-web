import type { ActionState } from "@/lib/church/types";

export type EquipmentAttachmentKind =
  | "photo"
  | "manual"
  | "warranty"
  | "receipt"
  | "maintenance"
  | "configuration_reference"
  | "other";

export type EquipmentRelationshipType =
  | "connected_to"
  | "managed_by"
  | "records_to"
  | "powered_by"
  | "monitored_by"
  | "assigned_with"
  | "gateway_for"
  | "controller_for"
  | "backup_for"
  | "replaces"
  | "other";

export type EquipmentAttachment = {
  id: string;
  church_id: string;
  equipment_id: string;
  kind: EquipmentAttachmentKind;
  storage_path: string;
  mime_type: string;
  byte_size: number;
  original_filename: string | null;
  uploaded_by: string;
  created_at: string;
  signed_url?: string | null;
};

export type EquipmentRelationship = {
  id: string;
  church_id: string;
  parent_equipment_id: string;
  child_equipment_id: string;
  relationship_type: EquipmentRelationshipType;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  related_equipment_id: string;
  related_name: string;
  related_asset_tag: string | null;
  related_category: string | null;
  direction: "outbound" | "inbound";
};

export type MediaActionState = ActionState;

export const ATTACHMENT_KINDS: {
  value: EquipmentAttachmentKind;
  label: string;
}[] = [
  { value: "photo", label: "Photo" },
  { value: "manual", label: "User manual" },
  { value: "warranty", label: "Warranty" },
  { value: "receipt", label: "Receipt" },
  { value: "maintenance", label: "Maintenance doc" },
  { value: "configuration_reference", label: "Configuration reference" },
  { value: "other", label: "Other" },
];

export const RELATIONSHIP_TYPES: {
  value: EquipmentRelationshipType;
  label: string;
}[] = [
  { value: "connected_to", label: "Connected to" },
  { value: "managed_by", label: "Managed by" },
  { value: "records_to", label: "Records to" },
  { value: "powered_by", label: "Powered by" },
  { value: "monitored_by", label: "Monitored by" },
  { value: "assigned_with", label: "Assigned with" },
  { value: "gateway_for", label: "Gateway for" },
  { value: "controller_for", label: "Controller for" },
  { value: "backup_for", label: "Backup for" },
  { value: "replaces", label: "Replaces" },
  { value: "other", label: "Other" },
];

export function labelForAttachmentKind(value: string): string {
  return ATTACHMENT_KINDS.find((item) => item.value === value)?.label ?? value;
}

export function labelForRelationshipType(value: string): string {
  return (
    RELATIONSHIP_TYPES.find((item) => item.value === value)?.label ?? value
  );
}

export function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

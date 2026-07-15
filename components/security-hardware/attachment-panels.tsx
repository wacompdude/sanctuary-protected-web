"use client";

import { useActionState, useEffect, useTransition } from "react";
import {
  deleteEquipmentAttachment,
  uploadEquipmentAttachments,
} from "@/app/(app)/security-hardware/media-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ATTACHMENT_KINDS,
  formatByteSize,
  isImageMime,
  labelForAttachmentKind,
  type EquipmentAttachment,
  type MediaActionState,
} from "@/lib/security-hardware/attachments";
import {
  EQUIPMENT_ATTACHMENT_MAX_BYTES,
  EQUIPMENT_ATTACHMENT_MAX_COUNT,
} from "@/lib/security-hardware/attachment-storage";
import { FileText, Trash2 } from "lucide-react";

const initialState: MediaActionState = {};

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function DeleteAttachmentButton({
  attachmentId,
  canDelete,
}: {
  attachmentId: string;
  canDelete: boolean;
}) {
  const [pending, startTransition] = useTransition();

  if (!canDelete) return null;

  return (
    <Button
      type="button"
      size="icon"
      variant="secondary"
      className="h-8 w-8"
      disabled={pending}
      aria-label="Remove attachment"
      onClick={() => {
        startTransition(async () => {
          await deleteEquipmentAttachment(attachmentId);
        });
      }}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}

export function EquipmentAttachmentsCard({
  equipmentId,
  attachments,
  canUpload,
  currentUserId,
  canManageAll,
}: {
  equipmentId: string;
  attachments: EquipmentAttachment[];
  canUpload: boolean;
  currentUserId: string;
  canManageAll: boolean;
}) {
  const boundUpload = uploadEquipmentAttachments.bind(null, equipmentId);
  const [state, formAction, pending] = useActionState(boundUpload, initialState);

  useEffect(() => {
    if (state.success) {
      const form = document.getElementById(
        `equipment-attachments-form-${equipmentId}`,
      ) as HTMLFormElement | null;
      form?.reset();
    }
  }, [state.success, equipmentId]);

  const remaining = Math.max(
    0,
    EQUIPMENT_ATTACHMENT_MAX_COUNT - attachments.length,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents and photos</CardTitle>
        <CardDescription>
          {attachments.length} of {EQUIPMENT_ATTACHMENT_MAX_COUNT} files · up to{" "}
          {EQUIPMENT_ATTACHMENT_MAX_BYTES / (1024 * 1024)} MB each (PNG, JPEG,
          WebP, GIF, PDF).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {attachments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No documents yet.</p>
        ) : (
          <ul className="space-y-3">
            {attachments.map((attachment) => {
              const image = isImageMime(attachment.mime_type);
              return (
                <li
                  key={attachment.id}
                  className="flex flex-wrap items-start gap-3 rounded-md border border-border p-3"
                >
                  {image && attachment.signed_url ? (
                    <a
                      href={attachment.signed_url}
                      target="_blank"
                      rel="noreferrer"
                      className="block shrink-0 overflow-hidden rounded-md border border-border"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={attachment.signed_url}
                        alt={attachment.original_filename || "Equipment photo"}
                        className="h-20 w-20 object-cover"
                      />
                    </a>
                  ) : (
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40">
                      <FileText className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {attachment.original_filename || "Untitled file"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {labelForAttachmentKind(attachment.kind)} ·{" "}
                      {formatByteSize(attachment.byte_size)}
                    </p>
                    {attachment.signed_url && (
                      <a
                        href={attachment.signed_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block text-xs underline underline-offset-4"
                      >
                        {image ? "Open photo" : "Open document"}
                      </a>
                    )}
                  </div>
                  <DeleteAttachmentButton
                    attachmentId={attachment.id}
                    canDelete={
                      canUpload &&
                      (canManageAll || attachment.uploaded_by === currentUserId)
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}

        {canUpload && remaining > 0 && (
          <form
            id={`equipment-attachments-form-${equipmentId}`}
            action={formAction}
            className="space-y-4"
          >
            {state.error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {state.error}
              </p>
            )}
            {state.success && (
              <p className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
                Files uploaded.
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor={`kind-${equipmentId}`}>Document type</Label>
              <select
                id={`kind-${equipmentId}`}
                name="kind"
                defaultValue="photo"
                className={selectClassName}
              >
                {ATTACHMENT_KINDS.map((kind) => (
                  <option key={kind.value} value={kind.value}>
                    {kind.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`files-${equipmentId}`}>Files</Label>
              <Input
                id={`files-${equipmentId}`}
                name="files"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
                multiple
                required
              />
              {state.fieldErrors?.files && (
                <p className="text-sm text-destructive">
                  {state.fieldErrors.files}
                </p>
              )}
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Uploading…" : "Upload files"}
            </Button>
          </form>
        )}

        {canUpload && remaining === 0 && (
          <p className="text-sm text-muted-foreground">
            This equipment has reached the maximum of{" "}
            {EQUIPMENT_ATTACHMENT_MAX_COUNT} attachments.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

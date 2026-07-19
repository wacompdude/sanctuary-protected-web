"use client";

import { useActionState, useEffect, useTransition } from "react";
import {
  archivePolicyAttachment,
  uploadPolicyAttachments,
} from "@/app/(app)/policies/media-actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  POLICY_ATTACHMENT_TYPES,
  formatPolicyByteSize,
  isPolicyImageMime,
  labelForPolicyAttachmentType,
} from "@/lib/policies/constants";
import {
  POLICY_ATTACHMENT_MAX_BYTES,
  POLICY_ATTACHMENT_MAX_COUNT,
} from "@/lib/policies/attachment-storage";
import type { PolicyAttachment } from "@/lib/policies/types";
import type { ActionState } from "@/lib/church/types";
import { FileText, Trash2 } from "lucide-react";

const initialState: ActionState = {};

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function RemoveAttachmentButton({
  attachmentId,
  canRemove,
}: {
  attachmentId: string;
  canRemove: boolean;
}) {
  const [pending, startTransition] = useTransition();
  if (!canRemove) return null;

  return (
    <Button
      type="button"
      size="icon"
      variant="secondary"
      className="h-8 w-8"
      disabled={pending}
      aria-label="Remove attachment"
      onClick={() => {
        if (!window.confirm("Remove this attachment?")) return;
        startTransition(async () => {
          await archivePolicyAttachment(attachmentId);
        });
      }}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}

export function PolicyAttachmentsCard({
  policyId,
  attachments,
  canManage,
}: {
  policyId: string;
  attachments: PolicyAttachment[];
  canManage: boolean;
}) {
  const boundUpload = uploadPolicyAttachments.bind(null, policyId);
  const [state, formAction, pending] = useActionState(boundUpload, initialState);

  useEffect(() => {
    if (state.success) {
      const form = document.getElementById(
        `policy-attachments-form-${policyId}`,
      ) as HTMLFormElement | null;
      form?.reset();
    }
  }, [state.success, policyId]);

  const remaining = Math.max(
    0,
    POLICY_ATTACHMENT_MAX_COUNT - attachments.length,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>PDF & Word attachments</CardTitle>
        <CardDescription>
          {attachments.length} of {POLICY_ATTACHMENT_MAX_COUNT} files · up to{" "}
          {POLICY_ATTACHMENT_MAX_BYTES / (1024 * 1024)} MB each. Prefer PDF or
          Word (.pdf, .doc, .docx); Excel and images are also allowed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {attachments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No attachments yet.</p>
        ) : (
          <ul className="space-y-3">
            {attachments.map((attachment) => {
              const image = isPolicyImageMime(attachment.mime_type);
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
                        alt={attachment.file_name}
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
                      {attachment.file_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {labelForPolicyAttachmentType(attachment.attachment_type)}{" "}
                      · {formatPolicyByteSize(attachment.size_bytes)}
                    </p>
                    {attachment.signed_url ? (
                      <a
                        href={attachment.signed_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium underline-offset-4 hover:underline"
                      >
                        Open / download
                      </a>
                    ) : null}
                  </div>
                  <RemoveAttachmentButton
                    attachmentId={attachment.id}
                    canRemove={canManage}
                  />
                </li>
              );
            })}
          </ul>
        )}

        {canManage && remaining > 0 ? (
          <form
            id={`policy-attachments-form-${policyId}`}
            action={formAction}
            className="space-y-3 rounded-md border border-dashed border-border p-4"
          >
            {state.error ? (
              <p className="text-sm text-destructive">{state.error}</p>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor={`attachment_type-${policyId}`}>Type</Label>
              <select
                id={`attachment_type-${policyId}`}
                name="attachment_type"
                defaultValue="supporting"
                className={selectClassName}
              >
                {POLICY_ATTACHMENT_TYPES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`files-${policyId}`}>PDF or Word files</Label>
              <input
                id={`files-${policyId}`}
                name="files"
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.xls,.xlsx,image/png,image/jpeg,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="block w-full text-sm"
              />
              {state.fieldErrors?.files ? (
                <p className="text-sm text-destructive">
                  {state.fieldErrors.files}
                </p>
              ) : null}
            </div>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Uploading…" : `Attach files (up to ${remaining})`}
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}

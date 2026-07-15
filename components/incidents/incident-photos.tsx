"use client";

import { useActionState, useEffect, useTransition } from "react";
import {
  deleteIncidentPhoto,
  uploadIncidentPhotos,
} from "@/app/(app)/incidents/actions";
import { IncidentPhotoPicker } from "@/components/incidents/incident-photo-picker";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  INCIDENT_PHOTO_MAX_COUNT,
} from "@/lib/incidents/attachment-storage";
import type { ActionState, IncidentAttachment } from "@/lib/incidents/types";
import { Trash2 } from "lucide-react";

const initialState: ActionState = {};

function DeletePhotoButton({
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
      className="absolute right-2 top-2 h-8 w-8"
      disabled={pending}
      aria-label="Remove photo"
      onClick={() => {
        startTransition(async () => {
          await deleteIncidentPhoto(attachmentId);
        });
      }}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}

export function IncidentPhotosCard({
  incidentId,
  attachments,
  canUpload,
  currentUserId,
  canManageAll,
}: {
  incidentId: string;
  attachments: IncidentAttachment[];
  canUpload: boolean;
  currentUserId: string;
  canManageAll: boolean;
}) {
  const boundUpload = uploadIncidentPhotos.bind(null, incidentId);
  const [state, formAction, pending] = useActionState(boundUpload, initialState);

  useEffect(() => {
    if (state.success) {
      const form = document.getElementById(
        `incident-photos-form-${incidentId}`,
      ) as HTMLFormElement | null;
      form?.reset();
    }
  }, [state.success, incidentId]);

  const remaining = Math.max(0, INCIDENT_PHOTO_MAX_COUNT - attachments.length);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Photos</CardTitle>
        <CardDescription>
          {attachments.length} of {INCIDENT_PHOTO_MAX_COUNT} photos attached.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {attachments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No photos yet.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {attachments.map((attachment) => (
              <li
                key={attachment.id}
                className="relative overflow-hidden rounded-md border border-border bg-muted/30"
              >
                {attachment.signed_url ? (
                  <a
                    href={attachment.signed_url}
                    target="_blank"
                    rel="noreferrer"
                    className="block"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={attachment.signed_url}
                      alt={attachment.original_filename || "Incident photo"}
                      className="aspect-square w-full object-cover"
                    />
                  </a>
                ) : (
                  <div className="flex aspect-square items-center justify-center p-3 text-center text-xs text-muted-foreground">
                    Unable to load photo
                  </div>
                )}
                <DeletePhotoButton
                  attachmentId={attachment.id}
                  canDelete={
                    canUpload &&
                    (canManageAll || attachment.uploaded_by === currentUserId)
                  }
                />
              </li>
            ))}
          </ul>
        )}

        {canUpload && remaining > 0 && (
          <form
            id={`incident-photos-form-${incidentId}`}
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
                Photos uploaded.
              </p>
            )}
            <IncidentPhotoPicker
              id={`photos-${incidentId}`}
              error={state.fieldErrors?.photos}
              remainingSlots={remaining}
            />
            <Button type="submit" disabled={pending}>
              {pending ? "Uploading…" : "Upload photos"}
            </Button>
          </form>
        )}

        {canUpload && remaining === 0 && (
          <p className="text-sm text-muted-foreground">
            This incident has reached the maximum of {INCIDENT_PHOTO_MAX_COUNT}{" "}
            photos.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

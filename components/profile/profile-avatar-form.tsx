"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  removeProfileAvatar,
  uploadProfileAvatar,
} from "@/app/(app)/profile/actions";
import { MemberAvatar } from "@/components/profile/member-avatar";
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
  AVATAR_MAX_BYTES,
  publicUrlForAvatarPath,
} from "@/lib/profile/avatar-storage";
import type { ProfileActionState, UserProfile } from "@/lib/profile/types";

const initialState: ProfileActionState = {};

export function ProfileAvatarForm({ profile }: { profile: UserProfile }) {
  const router = useRouter();
  const displayName =
    profile.full_name ||
    [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
    "Member";
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    publicUrlForAvatarPath(profile.avatar_url),
  );
  const [uploadState, uploadAction, uploadPending] = useActionState(
    uploadProfileAvatar,
    initialState,
  );
  const [removeState, removeAction, removePending] = useActionState(
    removeProfileAvatar,
    initialState,
  );

  useEffect(() => {
    if (uploadState.success || removeState.success) {
      router.refresh();
    }
  }, [uploadState.success, removeState.success, router]);

  useEffect(() => {
    setPreviewUrl(publicUrlForAvatarPath(profile.avatar_url));
  }, [profile.avatar_url]);

  const pending = uploadPending || removePending;
  const error = uploadState.error || removeState.error;
  const fieldError = uploadState.fieldErrors?.avatar;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile photo</CardTitle>
        <CardDescription>
          Add a photo so teammates can recognize you. PNG, JPEG, WebP, or GIF ·
          up to {Math.round(AVATAR_MAX_BYTES / (1024 * 1024))} MB.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {(uploadState.success || removeState.success) && !error ? (
          <p className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
            Profile photo updated.
          </p>
        ) : null}

        <div className="flex items-center gap-4">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={`${displayName} profile photo`}
              className="h-20 w-20 rounded-full object-cover ring-1 ring-border"
            />
          ) : (
            <MemberAvatar name={displayName} size="lg" />
          )}
          <div className="min-w-0 text-sm text-muted-foreground">
            {profile.avatar_url
              ? "Current photo on file."
              : "No photo yet — capture or upload one below."}
          </div>
        </div>

        <form action={uploadAction} className="space-y-3">
          <input type="hidden" name="user_id" value={profile.id} />
          <div className="space-y-2">
            <Label htmlFor="avatar">Photo</Label>
            <Input
              id="avatar"
              name="avatar"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              capture="user"
              disabled={pending}
              aria-invalid={!!fieldError}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const url = URL.createObjectURL(file);
                setPreviewUrl((previous) => {
                  if (previous?.startsWith("blob:")) {
                    URL.revokeObjectURL(previous);
                  }
                  return url;
                });
              }}
            />
            {fieldError ? (
              <p className="text-sm text-destructive">{fieldError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                On phones, this can open the camera. You can also choose an
                existing photo.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              {uploadPending ? "Uploading…" : "Save photo"}
            </Button>
          </div>
        </form>

        {profile.avatar_url ? (
          <form action={removeAction}>
            <input type="hidden" name="user_id" value={profile.id} />
            <Button type="submit" variant="outline" disabled={pending}>
              {removePending ? "Removing…" : "Remove photo"}
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}

"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  removeChurchLogo,
  updateChurchBrandingSettings,
  uploadChurchLogo,
} from "@/app/(app)/settings/church/actions";
import {
  LabeledInput,
  SettingsSectionCard,
} from "@/components/settings/settings-form-shell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ChurchSettingsRecord } from "@/lib/church/settings";
import {
  LOGO_ALLOWED_MIME,
  LOGO_MAX_BYTES,
  publicUrlForLogoPath,
} from "@/lib/church/logo-storage";
import type { ActionState } from "@/lib/church/types";
import { Upload } from "lucide-react";

export function ChurchBrandingForm({
  church,
  canEdit,
}: {
  church: ChurchSettingsRecord;
  canEdit: boolean;
}) {
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);

  const [uploadState, uploadAction, uploadPending] = useActionState(
    uploadChurchLogo,
    {} as ActionState,
  );
  const [removeState, removeAction, removePending] = useActionState(
    removeChurchLogo,
    {} as ActionState,
  );

  useEffect(() => {
    if (uploadState.success || removeState.success) {
      setSelectedFile(null);
      setLocalPreview(null);
      setClientError(null);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    }
  }, [uploadState.success, removeState.success, router]);

  useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  const savedPreviewUrl = publicUrlForLogoPath(church.logo_path);
  const previewUrl = localPreview ?? savedPreviewUrl;

  function onFileChosen(file: File | null) {
    setClientError(null);
    if (localPreview) {
      URL.revokeObjectURL(localPreview);
      setLocalPreview(null);
    }
    setSelectedFile(null);

    if (!file) return;

    if (!LOGO_ALLOWED_MIME.has(file.type)) {
      setClientError(
        "Choose a PNG, JPEG, WebP, or GIF image from your computer.",
      );
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setClientError("Logo must be 2 MB or smaller.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setSelectedFile(file);
    setLocalPreview(URL.createObjectURL(file));
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
          <CardDescription>
            Upload a logo image from your computer (PNG, JPEG, WebP, or GIF, max
            2 MB).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={`${church.name} logo preview`}
              className="h-24 w-24 rounded-md border object-contain bg-muted"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-md border border-dashed bg-muted/40 text-xs text-muted-foreground">
              No logo
            </div>
          )}

          {canEdit ? (
            <>
              <form action={uploadAction} className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor={inputId}>Choose file from your computer</Label>
                  <input
                    ref={inputRef}
                    id={inputId}
                    name="logo"
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif"
                    required
                    className="block w-full cursor-pointer text-sm text-foreground file:mr-4 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
                    onChange={(event) => {
                      onFileChosen(event.target.files?.[0] ?? null);
                    }}
                  />
                  {selectedFile && (
                    <p className="text-xs text-muted-foreground">
                      Selected: {selectedFile.name} (
                      {Math.round(selectedFile.size / 1024)} KB)
                    </p>
                  )}
                  {(clientError || uploadState.fieldErrors?.logo) && (
                    <p className="text-sm text-destructive" role="alert">
                      {clientError || uploadState.fieldErrors?.logo}
                    </p>
                  )}
                </div>

                {uploadState.error && (
                  <p className="text-sm text-destructive" role="alert">
                    {uploadState.error}
                  </p>
                )}
                {uploadState.success && (
                  <p className="text-sm text-green-700 dark:text-green-400">
                    Logo uploaded successfully.
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={uploadPending}
                    onClick={() => inputRef.current?.click()}
                  >
                    Browse files…
                  </Button>
                  <Button
                    type="submit"
                    disabled={uploadPending || !selectedFile}
                  >
                    <Upload className="h-4 w-4" />
                    {uploadPending ? "Uploading…" : "Upload selected file"}
                  </Button>
                </div>
              </form>

              {church.logo_path ? (
                <form action={removeAction}>
                  {removeState.error && (
                    <p className="mb-2 text-sm text-destructive" role="alert">
                      {removeState.error}
                    </p>
                  )}
                  <Button
                    type="submit"
                    size="sm"
                    variant="outline"
                    disabled={removePending}
                  >
                    {removePending ? "Removing…" : "Remove current logo"}
                  </Button>
                </form>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              View only. Owners and administrators can upload a logo.
            </p>
          )}
        </CardContent>
      </Card>

      <SettingsSectionCard
        title="Brand colors"
        description="Optional hex colors for your organization."
        action={updateChurchBrandingSettings}
        canEdit={canEdit}
        submitLabel="Save colors"
      >
        {({ fieldErrors }) => (
          <>
            <input
              type="hidden"
              name="logo_path"
              value={church.logo_path ?? ""}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <LabeledInput
                id="primary_brand_color"
                name="primary_brand_color"
                label="Primary brand color"
                placeholder="#1A6B4A"
                defaultValue={church.primary_brand_color}
                error={fieldErrors?.primary_brand_color}
              />
              <LabeledInput
                id="secondary_brand_color"
                name="secondary_brand_color"
                label="Secondary brand color"
                placeholder="#0F3D2E"
                defaultValue={church.secondary_brand_color}
                error={fieldErrors?.secondary_brand_color}
              />
            </div>
            {(church.primary_brand_color || church.secondary_brand_color) && (
              <div className="flex gap-3">
                {church.primary_brand_color && (
                  <div
                    className="h-10 w-10 rounded-md border"
                    style={{ backgroundColor: church.primary_brand_color }}
                    title="Primary"
                  />
                )}
                {church.secondary_brand_color && (
                  <div
                    className="h-10 w-10 rounded-md border"
                    style={{ backgroundColor: church.secondary_brand_color }}
                    title="Secondary"
                  />
                )}
              </div>
            )}
          </>
        )}
      </SettingsSectionCard>
    </div>
  );
}

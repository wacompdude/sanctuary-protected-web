"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  EQUIPMENT_PHOTO_MAX_BYTES,
  EQUIPMENT_PHOTO_MAX_COUNT,
} from "@/lib/security-hardware/attachment-storage";

type Preview = {
  id: string;
  name: string;
  url: string;
};

export function EquipmentPhotoPicker({
  id = "photos",
  error,
  remainingSlots = EQUIPMENT_PHOTO_MAX_COUNT,
}: {
  id?: string;
  error?: string;
  remainingSlots?: number;
}) {
  const [previews, setPreviews] = useState<Preview[]>([]);
  const maxSelectable = Math.max(
    0,
    Math.min(EQUIPMENT_PHOTO_MAX_COUNT, remainingSlots),
  );

  useEffect(() => {
    return () => {
      for (const preview of previews) {
        URL.revokeObjectURL(preview.url);
      }
    };
  }, [previews]);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Photos</Label>
      <Input
        id={id}
        name="photos"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        disabled={maxSelectable === 0}
        aria-invalid={!!error}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []).slice(
            0,
            maxSelectable,
          );
          setPreviews((previous) => {
            for (const preview of previous) {
              URL.revokeObjectURL(preview.url);
            }
            return files.map((file) => ({
              id: `${file.name}-${file.size}-${file.lastModified}`,
              name: file.name,
              url: URL.createObjectURL(file),
            }));
          });
        }}
      />
      <p className="text-xs text-muted-foreground">
        Up to {maxSelectable} photos · PNG, JPEG, WebP, or GIF ·{" "}
        {Math.round(EQUIPMENT_PHOTO_MAX_BYTES / (1024 * 1024))} MB each
      </p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {previews.length > 0 ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {previews.map((preview) => (
            <li
              key={preview.id}
              className="overflow-hidden rounded-md border border-border bg-muted/30"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview.url}
                alt={preview.name}
                className="aspect-square w-full object-cover"
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

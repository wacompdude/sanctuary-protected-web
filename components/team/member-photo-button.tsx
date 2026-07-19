"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadProfileAvatar } from "@/app/(app)/profile/actions";
import { Button } from "@/components/ui/button";
import { Camera } from "lucide-react";

export function MemberPhotoButton({
  userId,
  memberName,
}: {
  userId: string;
  memberName: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        capture="user"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;

          const formData = new FormData();
          formData.set("user_id", userId);
          formData.set("avatar", file);

          startTransition(async () => {
            const result = await uploadProfileAvatar({}, formData);
            if (result.error || result.fieldErrors?.avatar) {
              window.alert(
                result.fieldErrors?.avatar ||
                  result.error ||
                  "Unable to upload photo.",
              );
              return;
            }
            router.refresh();
          });
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
        title={`Set photo for ${memberName}`}
      >
        <Camera className="mr-1 h-3.5 w-3.5" />
        {pending ? "Uploading…" : "Photo"}
      </Button>
    </>
  );
}

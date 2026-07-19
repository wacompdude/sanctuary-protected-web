import { cn } from "@/lib/utils";
import {
  initialsFromName,
  publicUrlForAvatarPath,
} from "@/lib/profile/avatar-storage";

export function MemberAvatar({
  name,
  avatarUrl,
  size = "md",
  className,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const src = publicUrlForAvatarPath(avatarUrl);
  const sizeClass =
    size === "sm"
      ? "h-8 w-8 text-xs"
      : size === "lg"
        ? "h-20 w-20 text-xl"
        : "h-10 w-10 text-sm";

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={`${name} profile photo`}
        className={cn(
          "shrink-0 rounded-full object-cover ring-1 ring-border",
          sizeClass,
          className,
        )}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground ring-1 ring-border",
        sizeClass,
        className,
      )}
    >
      {initialsFromName(name)}
    </span>
  );
}

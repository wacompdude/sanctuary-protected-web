import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  href?: string | null;
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
  showWordmark?: boolean;
  /** light = white mark for dark backgrounds */
  variant?: "dark" | "light";
  priority?: boolean;
  size?: number;
};

export function BrandLogo({
  href = "/",
  className,
  markClassName,
  wordmarkClassName,
  showWordmark = true,
  variant = "dark",
  priority = false,
  size = 32,
}: BrandLogoProps) {
  const src =
    variant === "light" ? "/brand/logo-light.png" : "/brand/logo.png";

  const content = (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Image
        src={src}
        alt={showWordmark ? "" : "Sanctuary Protected"}
        width={size}
        height={size}
        priority={priority}
        className={cn("object-contain", markClassName)}
        style={{ width: size, height: size }}
      />
      {showWordmark && (
        <span
          className={cn(
            "text-lg font-semibold tracking-tight",
            wordmarkClassName,
          )}
        >
          Sanctuary Protected
        </span>
      )}
    </span>
  );

  if (href === null) {
    return content;
  }

  return (
    <Link
      href={href}
      className="inline-flex items-center"
      aria-label="Sanctuary Protected home"
    >
      {content}
    </Link>
  );
}

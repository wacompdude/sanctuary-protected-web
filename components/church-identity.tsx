import { publicUrlForLogoPath } from "@/lib/church/logo-storage";

export function ChurchIdentity({
  name,
  logoPath,
  size = "md",
}: {
  name: string;
  logoPath?: string | null;
  size?: "sm" | "md";
}) {
  const logoUrl = publicUrlForLogoPath(logoPath);
  const box = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const title = size === "sm" ? "text-base" : "text-lg";

  return (
    <div className="flex min-w-0 items-center gap-3">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={`${name} logo`}
          className={`${box} shrink-0 rounded-md border border-border bg-muted object-contain`}
        />
      ) : null}
      <h2 className={`truncate font-semibold tracking-tight ${title}`}>
        {name}
      </h2>
    </div>
  );
}

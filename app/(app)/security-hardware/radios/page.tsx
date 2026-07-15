import { redirect } from "next/navigation";

/** Category shortcut → filtered inventory list (full category pages in Phase 4). */
export default function SecurityHardwareRadiosPage() {
  redirect("/security-hardware?category=radio");
}

import { redirect } from "next/navigation";

export default function SecurityHardwareAccessControlPage() {
  redirect("/security-hardware?category=access_control");
}

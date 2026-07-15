import { redirect } from "next/navigation";

export default function SecurityHardwareNetworkPage() {
  redirect("/security-hardware?category=network_device");
}

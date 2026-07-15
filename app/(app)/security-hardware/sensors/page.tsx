import { redirect } from "next/navigation";

export default function SecurityHardwareSensorsPage() {
  redirect("/security-hardware?category=sensor");
}

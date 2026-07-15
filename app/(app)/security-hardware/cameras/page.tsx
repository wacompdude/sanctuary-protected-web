import { redirect } from "next/navigation";

export default function SecurityHardwareCamerasPage() {
  redirect("/security-hardware?category=camera");
}

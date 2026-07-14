import { redirect } from "next/navigation";

export default function ChurchSettingsIndexPage() {
  redirect("/settings/church/general");
}

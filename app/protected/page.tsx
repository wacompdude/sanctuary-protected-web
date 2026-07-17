import { redirect } from "next/navigation";

/** Legacy Supabase starter route — keep URL working, send users into the app. */
export default function ProtectedPage() {
  redirect("/home");
}

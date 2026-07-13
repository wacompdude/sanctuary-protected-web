import { redirect } from "next/navigation";

/** Legacy starter path — keep for bookmarks and emails. */
export default function Page() {
  redirect("/register");
}

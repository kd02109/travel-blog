import { redirect } from "next/navigation";
import { requireEditor } from "../lib/auth";

export default async function AdminHome() {
  await requireEditor();
  redirect("/posts");
}

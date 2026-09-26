import { requireEditor } from "../../../lib/auth";
import { Composer } from "../../composer";

export default async function EditPost({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireEditor();
  const { id } = await params;
  return <Composer postId={id} />;
}

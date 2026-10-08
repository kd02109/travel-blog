import { requireEditor } from "../../../lib/auth";
import { resolvePublicSiteOrigin } from "../../../lib/public-post-url";
import { Composer } from "../../composer";

export default async function EditPost({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireEditor();
  const { id } = await params;
  const publicSiteOrigin = resolvePublicSiteOrigin(
    process.env.WEB_ORIGIN,
    process.env.NODE_ENV === "development",
  );
  return <Composer postId={id} publicSiteOrigin={publicSiteOrigin} />;
}

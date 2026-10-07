import { requireEditor } from "../../lib/auth";
import { resolvePublicSiteOrigin } from "../../lib/public-post-url";
import { PostList } from "./post-list";

export default async function PostsPage() {
  const { site } = await requireEditor();
  const publicSiteOrigin = resolvePublicSiteOrigin(
    process.env.WEB_ORIGIN,
    process.env.NODE_ENV === "development",
  );
  return <PostList siteId={site.id} publicSiteOrigin={publicSiteOrigin} />;
}

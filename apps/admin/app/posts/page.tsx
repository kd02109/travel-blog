import { requireEditor } from "../../lib/auth";
import { PostList } from "./post-list";

export default async function PostsPage() {
  const { site } = await requireEditor();
  return <PostList siteId={site.id} />;
}

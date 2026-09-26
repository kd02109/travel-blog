import { requireEditor } from "../../lib/auth";
import { CommentInbox } from "./comment-inbox";

export default async function CommentsPage() {
  const { site } = await requireEditor();
  return <CommentInbox siteId={site.id} />;
}

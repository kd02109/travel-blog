import { requireEditor } from "../../lib/auth";
import { AccountDeletionInbox } from "./request-list";

export default async function AccountDeletionsPage() {
  const { site } = await requireEditor();
  return <AccountDeletionInbox siteId={site.id} />;
}

import { requireEditor } from "../../lib/auth";
import { resolvePublicSiteOrigin } from "../../lib/public-post-url";
import { Composer } from "../composer";
export default async function Write() {
  await requireEditor();
  const publicSiteOrigin = resolvePublicSiteOrigin(
    process.env.WEB_ORIGIN,
    process.env.NODE_ENV === "development",
  );
  return <Composer publicSiteOrigin={publicSiteOrigin} />;
}

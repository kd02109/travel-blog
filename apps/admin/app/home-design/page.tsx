import { requireEditor } from "../../lib/auth";
import { HomeDesignEditor } from "./home-design-editor";

export default async function HomeDesign() {
  const { site } = await requireEditor();
  return <HomeDesignEditor siteId={site.id} siteName={site.name} />;
}

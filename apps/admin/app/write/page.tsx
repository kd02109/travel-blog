import { requireEditor } from "../../lib/auth";
import { Composer } from "../composer";
export default async function Write() {
  await requireEditor();
  return <Composer />;
}

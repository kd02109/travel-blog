import { notFound } from "next/navigation";
import { Composer } from "../composer";
export default function Playground() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <Composer />;
}

import { notFound } from "next/navigation";
import { MockPlayground } from "@repo/mock-api/playground";
export default function MockPage() {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.NEXT_PUBLIC_API_MOCKING !== "enabled"
  )
    notFound();
  return <MockPlayground />;
}

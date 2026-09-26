import {
  parseActionInput,
  parseActionOutput,
  apiErrorSchema,
  type ActionInput,
  type ActionOutput,
} from "@repo/contracts";
import { readActions, type ReadAction } from "./actions";
import { TravelApiError, parseRetryAfter } from "./errors";
/** Pure transport for Node tests; applications import the server-only entry. */
export function createServerReader(options: {
  baseURL: string;
  getAccessToken?: () => Promise<string | undefined>;
  fetch?: typeof fetch;
}) {
  const url = new URL(options.baseURL);
  if (!["https:", "http:"].includes(url.protocol))
    throw new Error("Invalid API URL");
  async function read<A extends ReadAction>(
    action: A,
    input: ActionInput<NoInfer<A>>,
  ): Promise<ActionOutput<A>> {
    if (!(readActions as readonly string[]).includes(action))
      throw new Error("Server reader only supports read actions");
    const parsed = parseActionInput(action, input);
    const token = await options.getAccessToken?.();
    let response: Response;
    try {
      response = await (options.fetch ?? fetch)(url, {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action, input: parsed }),
      });
    } catch {
      throw new TravelApiError(0, "network_error");
    }
    const data: unknown = await response.json();
    if (!response.ok) {
      const error = apiErrorSchema.safeParse(data);
      throw new TravelApiError(
        response.status,
        error.success ? error.data.error : "http_error",
        error.success ? error.data.request_id : undefined,
        response.status === 429
          ? (parseRetryAfter(response.headers.get("retry-after")) ?? 60)
          : undefined,
      );
    }
    return parseActionOutput(action, data);
  }
  return {
    read,
    getSite: (slug = "parents-travel") => read("site.get", { slug }),
    listPosts: (input: ActionInput<"posts.list">) => read("posts.list", input),
    getPost: (input: ActionInput<"post.get">) => read("post.get", input),
  };
}

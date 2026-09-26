import axios from "axios";
import {
  apiErrorSchema,
  parseActionInput,
  parseActionOutput,
  type ApiAction,
  type ActionInput,
  type ActionOutput,
  type PostListInput,
} from "@repo/contracts";
import { TravelApiError, parseRetryAfter } from "./errors";
export {
  TravelApiError,
  errorMessage,
  shouldRetryQuery,
  parseRetryAfter,
} from "./errors";
export function createTravelApi(options: {
  baseURL: string;
  getAccessToken?: () => Promise<string | undefined>;
  getVisitorToken?: () => Promise<string | undefined>;
  onInvalidVisitor?: () => void;
}) {
  const client = axios.create({ baseURL: options.baseURL, timeout: 10000 });
  let retryAt = 0;
  async function request(
    action: string,
    input: unknown = {},
  ): Promise<unknown> {
    if (retryAt > Date.now())
      throw new TravelApiError(
        429,
        "rate_limited",
        undefined,
        Math.ceil((retryAt - Date.now()) / 1000),
      );
    const token = await options.getAccessToken?.();
    const visitor =
      !token &&
      [
        "comment.create",
        "comment.edit",
        "comment.delete",
        "like.get",
        "like.set",
      ].includes(action)
        ? await options.getVisitorToken?.()
        : undefined;
    try {
      const { data } = await client.post(
        "",
        { action, input },
        {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(visitor ? { "X-Visitor-Token": visitor } : {}),
          },
        },
      );
      return data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const parsed = apiErrorSchema.safeParse(error.response?.data);
        const retryAfter =
          error.response?.status === 429
            ? (parseRetryAfter(error.response.headers?.["retry-after"]) ?? 60)
            : undefined;
        if (retryAfter !== undefined) retryAt = Date.now() + retryAfter * 1000;
        if (
          parsed.success &&
          ["invalid_visitor", "visitor_required"].includes(parsed.data.error)
        )
          options.onInvalidVisitor?.();
        throw new TravelApiError(
          error.response?.status ?? 0,
          parsed.success ? parsed.data.error : "network_error",
          parsed.success ? parsed.data.request_id : undefined,
          retryAfter,
        );
      }
      throw error;
    }
  }
  /** Validates both boundaries. Use this for new features instead of raw request. */
  async function call<A extends ApiAction>(
    action: A,
    input: ActionInput<NoInfer<A>>,
  ): Promise<ActionOutput<A>> {
    const parsedInput = parseActionInput(action, input);
    const output = await request(action, parsedInput);
    return parseActionOutput(action, output);
  }
  return {
    /** @deprecated Raw transport retained for the legacy mock playground. Use call. */
    request,
    call,
    getSite(slug = "parents-travel") {
      return call("site.get", { slug });
    },
    listPosts(input: PostListInput) {
      return call("posts.list", input);
    },
    getPost: (input: ActionInput<"post.get">) => call("post.get", input),
    getMe: () => call("me", {}),
    createVisitor: () => call("visitor.create", {}),
    listComments: (input: ActionInput<"comments.list">) =>
      call("comments.list", input),
    createPost: (input: ActionInput<"admin.post.create">) =>
      call("admin.post.create", input),
    savePost: (input: ActionInput<"admin.post.save">) =>
      call("admin.post.save", input),
    publishPost: (input: ActionInput<"admin.post.publish">) =>
      call("admin.post.publish", input),
  };
}
export const queryKeys = {
  site: (slug: string) => ["site", slug] as const,
  posts: (input: PostListInput) => ["posts", input] as const,
};

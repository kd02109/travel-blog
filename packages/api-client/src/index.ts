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
export class TravelApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public requestId?: string,
  ) {
    super(code);
    this.name = "TravelApiError";
  }
}
export function createTravelApi(options: {
  baseURL: string;
  getAccessToken?: () => Promise<string | undefined>;
  getVisitorToken?: () => Promise<string | undefined>;
}) {
  const client = axios.create({ baseURL: options.baseURL, timeout: 10000 });
  async function request(
    action: string,
    input: unknown = {},
  ): Promise<unknown> {
    const token = await options.getAccessToken?.();
    const visitor = await options.getVisitorToken?.();
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
        throw new TravelApiError(
          error.response?.status ?? 0,
          parsed.success ? parsed.data.error : "network_error",
          parsed.success ? parsed.data.request_id : undefined,
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

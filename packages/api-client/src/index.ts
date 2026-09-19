import axios from "axios";
import {
  apiErrorSchema,
  siteSchema,
  postListInputSchema,
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
  return {
    request,
    async getSite(slug = "parents-travel") {
      return siteSchema.parse(await request("site.get", { slug }));
    },
    listPosts(input: PostListInput) {
      return request("posts.list", postListInputSchema.parse(input));
    },
  };
}
export const queryKeys = {
  site: (slug: string) => ["site", slug] as const,
  posts: (input: PostListInput) => ["posts", input] as const,
};

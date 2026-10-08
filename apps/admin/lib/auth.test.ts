import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerDatabase: vi.fn(),
  createTravelApi: vi.fn(),
  headers: vi.fn(),
  redirect: vi.fn((path: string): never => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@repo/database/server", () => ({
  createServerDatabase: mocks.createServerDatabase,
}));
vi.mock("@repo/api-client", () => ({
  createTravelApi: mocks.createTravelApi,
  TravelApiError: class extends Error {
    constructor(public status: number) {
      super("API error");
    }
  },
}));

import { getAdminAccess, requireEditor } from "./auth";

const userId = "b1181a76-7f7b-4a43-90ab-d8b966ea407b";
const siteId = "39a41639-6ca5-4f6b-91b0-a522362595d3";

function arrange({
  provider = "kakao",
  role = "editor",
  initialSession = true,
  sessionError = null,
  userError = null,
  user = true,
}: {
  provider?: string;
  role?: string | null;
  initialSession?: boolean;
  sessionError?: { status?: number; code?: string } | null;
  userError?: { status?: number; code?: string } | null;
  user?: boolean;
} = {}) {
  const session = { access_token: "verified-token", user: { id: userId } };
  const getSession = vi.fn().mockResolvedValue({
    data: { session: initialSession ? session : null },
    error: sessionError,
  });
  const getUser = vi.fn().mockResolvedValue({
    data: {
      user: user ? { id: userId, identities: [{ provider }] } : null,
    },
    error: userError,
  });
  mocks.createServerDatabase.mockResolvedValue({
    auth: { getSession, getUser },
  });
  const getSite = vi.fn().mockResolvedValue({ id: siteId });
  const getMe = vi.fn().mockResolvedValue({
    user_id: userId,
    profile: { display_name: "운영자" },
    memberships: role ? [{ site_id: siteId, role }] : [],
  });
  mocks.createTravelApi.mockReturnValue({ getSite, getMe });
  return { getSession, getUser, getSite, getMe };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.headers.mockResolvedValue(new Headers());
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-key");
});
afterEach(() => vi.unstubAllEnvs());

describe("admin access", () => {
  it("keeps proxy-detected expiry visible after invalid cookies are cleared", async () => {
    arrange({ initialSession: false });
    mocks.headers.mockResolvedValue(
      new Headers({ "x-travel-session-expired": "1" }),
    );
    await expect(requireEditor()).rejects.toThrow(
      "redirect:/login?error=expired",
    );
  });
  it("distinguishes a missing session from an expired one", async () => {
    const { getUser } = arrange({ initialSession: false });
    expect(await getAdminAccess()).toEqual({
      status: "unauthenticated",
      reason: "missing",
    });
    expect(getUser).not.toHaveBeenCalled();
    await expect(requireEditor()).rejects.toThrow("redirect:/login");

    arrange({ user: false });
    expect(await getAdminAccess()).toEqual({
      status: "unauthenticated",
      reason: "expired",
    });
    await expect(requireEditor()).rejects.toThrow(
      "redirect:/login?error=expired",
    );
  });

  it("treats an Auth service failure as unavailable", async () => {
    arrange({ userError: { status: 503 } });
    expect(await getAdminAccess()).toEqual({ status: "unavailable" });
    await expect(requireEditor()).rejects.toThrow(
      "redirect:/login?error=unavailable",
    );
  });

  it.each([
    "bad_jwt",
    "session_expired",
    "session_not_found",
    "refresh_token_not_found",
    "user_not_found",
  ])("treats %s as an expired login even with HTTP 422", async (code) => {
    arrange({ userError: { status: 422, code } });
    expect(await getAdminAccess()).toEqual({
      status: "unauthenticated",
      reason: "expired",
    });
  });

  it("classifies a failed session refresh by its error code", async () => {
    const { getUser } = arrange({
      sessionError: { status: 422, code: "refresh_token_already_used" },
    });
    expect(await getAdminAccess()).toEqual({
      status: "unauthenticated",
      reason: "expired",
    });
    expect(getUser).not.toHaveBeenCalled();
  });

  it("denies an authenticated account without a Kakao identity", async () => {
    const { getMe } = arrange({ provider: "google" });
    expect(await getAdminAccess()).toEqual({ status: "forbidden" });
    expect(getMe).not.toHaveBeenCalled();
  });

  it("denies an authenticated Kakao account without an active editor role", async () => {
    arrange({ role: null });
    expect(await getAdminAccess()).toEqual({ status: "forbidden" });
    await expect(requireEditor()).rejects.toThrow("redirect:/forbidden");
  });

  it("allows a matching Kakao editor and uses the refreshed session token", async () => {
    const { getSession } = arrange();
    const access = await getAdminAccess();
    expect(access.status).toBe("authorized");
    if (access.status !== "authorized") throw new Error("not authorized");
    expect(access.user.id).toBe(userId);
    expect(access.membership.role).toBe("editor");
    expect(getSession).toHaveBeenCalledTimes(2);
    expect(mocks.createTravelApi).toHaveBeenCalledWith({
      baseURL: "https://example.supabase.co/functions/v1/travel-api",
      getAccessToken: expect.any(Function),
    });
    const options = mocks.createTravelApi.mock.calls.at(0)?.[0];
    expect(await options?.getAccessToken()).toBe("verified-token");
  });

  it("rejects an API identity that differs from the verified user", async () => {
    const { getMe } = arrange();
    getMe.mockResolvedValue({
      user_id: "different-user",
      memberships: [{ site_id: siteId, role: "owner" }],
    });
    expect(await getAdminAccess()).toEqual({
      status: "unauthenticated",
      reason: "expired",
    });
  });
});

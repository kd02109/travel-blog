import { CATEGORIES, SITE_NAME, SITE_SLUG } from "@repo/constants";
import type { MockState, Role, Content, Publication, Revision } from "./types";
export const MOCK_API_PATH = "/__mock__/functions/v1/travel-api";
export const MOCK_SITE_ID = "10000000-0000-4000-8000-000000000001";
export const MOCK_NOW = "2026-09-19T00:00:00.000Z";
export const MOCK_SITE = { id: MOCK_SITE_ID, slug: SITE_SLUG, name: SITE_NAME };
export const MOCK_TOKENS: Record<Role, string> = {
  reader: "mock-reader",
  editor: "mock-editor",
  admin: "mock-admin",
  owner: "mock-owner",
};
export const mockId = (group: number, index: number) =>
  `${String(group).padStart(8, "0")}-0000-4000-8000-${String(index).padStart(12, "0")}`;
export const MOCK_POST_IDS = CATEGORIES.map((_, i) => mockId(2, i + 1));
export const FIXTURE_SOURCE = {
  kind: "inferred-from-local-exports",
  penpotFileId: "d8ac01df-6646-81d2-8008-a6ccf0f75a6b",
  blogPageId: "615b85b4-c247-80c0-8008-a84abbf6e1d9",
  adminPageId: "cead9337-769a-80f2-8008-a8375e83e5ae",
  designVersion: "3.0",
  capturedAt: "2026-09-19",
  documents: [
    "docs/design/five-category-blog-and-admin.ko.md",
    "docs/design/penpot-five-category-manifest.json",
    "docs/design/penpot-admin-home-templates-manifest.json",
    "supabase/API.ko.md",
  ],
  note: "카테고리·화면 상태는 로컬 Penpot 설계 기준. 제목·본문·사용자·숫자는 합성 데이터이며 실제 게시물이나 최신 Penpot API 응답이 아닙니다.",
} as const;
export const MOCK_DESIGN = {
  background: "#F6F5EF",
  foreground: "#173C42",
  muted: "#536569",
  border: "#CED8D7",
};
const titles = [
  "서울숲에서 천천히 걸었던 하루",
  "제주에서 이틀, 바다 곁에 머물다",
  "강릉 골목에서 만난 커피",
  "창밖으로 바다가 보이는 숙소",
  "제주 2박 3일 여행 일정표",
];
const metadata = [
  {
    region: "서울",
    visited_on: "2026-09-12",
    distance_km: 3.2,
    duration_minutes: 80,
  },
  { region: "제주", start_date: "2026-09-01", end_date: "2026-09-03" },
  {
    region: "강릉",
    visited_on: "2026-08-24",
    place_name: "예시 바다 카페",
    venue_type: "cafe",
  },
  {
    region: "제주",
    check_in: "2026-09-01",
    check_out: "2026-09-03",
    place_name: "예시 바다 숙소",
  },
  {},
];
export function createFixtures(empty = false): MockState {
  const members = (["reader", "editor", "admin", "owner"] as const).map(
    (role, i) => ({
      user_id: mockId(3, i + 1),
      site_id: MOCK_SITE_ID,
      role,
      active: true,
      display_name: `예시 ${role}`,
    }),
  );
  const assets = CATEGORIES.map((_, i) => ({
    id: mockId(4, i + 1),
    kind: "image" as const,
    state: "ready" as const,
    created_at: MOCK_NOW,
    metadata: { mime: "image/svg+xml", width: 960, height: 640 },
    preview_asset_id: null,
    url: "/mock-assets/placeholder.svg",
  }));
  const pdf = {
    id: mockId(4, 6),
    kind: "pdf" as const,
    state: "ready" as const,
    created_at: MOCK_NOW,
    metadata: { mime: "application/pdf", page_count: 1 },
    preview_asset_id: mockId(4, 5),
    url: "/mock-assets/itinerary.pdf",
  };
  const posts = empty
    ? []
    : CATEGORIES.map((category, i) => {
        const draft_content: Content = {
          title: titles[i]!,
          slug: `example-${category.code}`,
          category_code: category.code,
          tags: ["예시", i === 0 ? "산책" : "여행"],
          metadata: metadata[i] as Record<string, string | number>,
          comments_enabled: i !== 4,
        };
        if (i === 4) draft_content.pdf_asset_id = pdf.id;
        else {
          draft_content.cover_asset_id = assets[i]!.id;
          draft_content.blocks = [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: `${titles[i]}. 이 글은 화면 개발을 위한 예시 여행 기록입니다.`,
                  styles: {},
                },
              ],
            },
          ];
        }
        return {
          id: mockId(2, i + 1),
          site_id: MOCK_SITE_ID,
          author_id: members[3]!.user_id,
          kind: i === 4 ? ("pdf" as const) : ("article" as const),
          status: "published" as const,
          draft_content,
          schema_version: 1,
          lock_version: 1,
          updated_at: MOCK_NOW,
          first_published_at: MOCK_NOW,
          deleted_at: null,
        };
      });
  const revisions: Revision[] = posts.map((p, i) => ({
    id: mockId(10, i + 1),
    post_id: p.id,
    snapshot: structuredClone(p.draft_content),
    created_at: MOCK_NOW,
    created_by: p.author_id,
    schema_version: 1,
    reason: "published",
    post_version: p.lock_version,
  }));
  const publications: Publication[] = posts.map((p, i) => ({
    post_id: p.id,
    revision_id: revisions[i]!.id,
    site_id: p.site_id,
    title: p.draft_content.title!,
    slug: p.draft_content.slug!,
    category_code: p.draft_content.category_code!,
    tags: p.draft_content.tags!,
    metadata: p.draft_content.metadata!,
    body_html:
      p.kind === "pdf"
        ? null
        : `<p>${p.draft_content.title}. 화면 개발용 예시입니다.</p>`,
    cover_asset_id: p.draft_content.cover_asset_id ?? null,
    pdf_asset_id: p.draft_content.pdf_asset_id ?? null,
    comments_enabled: p.kind === "article",
    published_at: MOCK_NOW,
    updated_at: MOCK_NOW,
  }));
  const settings = {
    template_id: "D" as const,
    title: SITE_NAME,
    description: "천천히 머물고, 오래 기억하는 여행",
    ...(empty
      ? {}
      : { hero_asset_id: assets[0]!.id, featured_post_id: posts[0]!.id }),
  };
  const extraPosts = empty
    ? []
    : (["draft", "private", "trashed"] as const).map((status, i) => ({
        ...structuredClone(posts[0]!),
        id: mockId(2, 6 + i),
        status,
        first_published_at: null,
        lock_version: 0,
        draft_content: {
          title: `예시 ${status} 여행기`,
          category_code: "day-walk" as const,
        },
        deleted_at: status === "trashed" ? MOCK_NOW : null,
      }));
  return {
    posts: [...posts, ...extraPosts],
    publications,
    members,
    assets: [...assets, pdf],
    likes: {},
    revisions,
    reports: [],
    accountDeletions: [],
    audit: [],
    draftSettings: structuredClone(settings),
    publishedSettings: structuredClone(settings),
    settingsVersion: 1,
    comments: empty
      ? []
      : [
          {
            id: mockId(5, 1),
            post_id: posts[0]!.id,
            parent_id: null,
            body: "다음 산책에 참고할게요. (예시 댓글)",
            status: "visible",
            version: 1,
            created_at: MOCK_NOW,
            updated_at: MOCK_NOW,
            author_id: members[0]!.user_id,
            author_kind: "member",
            guest_name: null,
            actor: members[0]!.user_id,
            request_key: mockId(6, 1),
            fingerprint: "seed",
          },
        ],
  };
}

"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  categorySchema,
  type ApiAction,
  type ActionInput,
} from "@repo/contracts";
import { createTravelApi } from "@repo/api-client";
import { CATEGORIES } from "@repo/constants";
import { Button } from "@repo/ui/button";
import { useMockApi } from "./provider";
import {
  FIXTURE_SOURCE,
  MOCK_DESIGN,
  MOCK_SITE_ID,
  MOCK_TOKENS,
} from "./fixtures";
import type { Publication, Role, Scenario, Settings } from "./types";
type Card = Pick<Publication, "post_id" | "title" | "category_code"> & {
  like_count: number | null;
  comment_count: number | null;
};
export function MockPlayground() {
  const runtime = useMockApi();
  const [role, setRole] = useState<Role | "guest">("guest");
  const [cards, setCards] = useState<Card[]>([]);
  const [category, setCategory] = useState("");
  const [template, setTemplate] = useState("D");
  const [message, setMessage] = useState("");
  const [detail, setDetail] = useState<unknown>(null);
  const [scenario, setScenario] = useState<Scenario>("default");
  const api = useMemo(
    () =>
      runtime
        ? createTravelApi({
            baseURL: runtime.apiPath,
            getAccessToken: async () =>
              role === "guest" ? undefined : MOCK_TOKENS[role],
          })
        : null,
    [runtime, role],
  );
  const refresh = useCallback(async () => {
    if (!api) return;
    try {
      const site = await api.getSite();
      const data = await api.call("posts.list", {
        site_id: MOCK_SITE_ID,
        ...(category ? { category: categorySchema.parse(category) } : {}),
      });
      setTemplate((site.settings as Settings).template_id ?? "D");
      setCards(data as Card[]);
      setMessage("");
    } catch (error) {
      setCards([]);
      setMessage(error instanceof Error ? error.message : "요청 실패");
    }
  }, [api, category]);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void refresh();
    });
    return () => {
      active = false;
    };
  }, [refresh]);
  async function action<A extends ApiAction>(name: A, input: ActionInput<A>) {
    if (!api) return;
    try {
      const data = await api.call(name, input);
      setDetail(data);
      setMessage(`${name} 완료`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "요청 실패");
    }
  }
  async function changeTemplate() {
    if (!api) return;
    try {
      const current = (await api.call("admin.settings.get", {
        site_id: MOCK_SITE_ID,
      })) as { version: number; draft: Settings };
      const saved = (await api.call("admin.settings.save", {
        site_id: MOCK_SITE_ID,
        version: current.version,
        settings: { ...current.draft, template_id: "A" },
      })) as { version: number };
      await api.call("admin.settings.apply", {
        site_id: MOCK_SITE_ID,
        version: saved.version,
      });
      await refresh();
      setMessage("홈 A 적용 완료");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "요청 실패");
    }
  }
  if (!runtime) return <p>개발 서버를 pnpm dev:mock으로 실행해 주세요.</p>;
  return (
    <main
      className="mx-auto max-w-5xl space-y-8 px-6 py-12"
      style={{
        background: MOCK_DESIGN.background,
        color: MOCK_DESIGN.foreground,
      }}
    >
      <header>
        <p className="text-sm">MirageJS · Penpot 설계 기반</p>
        <h1 className="mt-3 text-3xl font-semibold">여행 블로그 API 체험</h1>
        <p className="mt-3">{FIXTURE_SOURCE.note}</p>
      </header>
      <section
        className="flex flex-wrap items-end gap-4"
        aria-label="Mock 환경 설정"
      >
        <label>
          역할
          <select
            aria-label="역할"
            className="ml-3 rounded border p-3"
            value={role}
            onChange={(e) => setRole(e.target.value as Role | "guest")}
          >
            {["guest", "reader", "editor", "admin", "owner"].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label>
          상태
          <select
            aria-label="상태"
            className="ml-3 rounded border p-3"
            value={scenario}
            onChange={(e) => {
              const next = e.target.value as Scenario;
              setScenario(next);
              runtime.engine.reset(next);
              setDetail(null);
              void refresh();
            }}
          >
            {["default", "empty", "error", "rate-limited"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <Button
          variant="outline"
          onClick={() => {
            runtime.engine.reset(scenario);
            setDetail(null);
            void refresh();
          }}
        >
          데이터 초기화
        </Button>
      </section>
      <section
        aria-label="홈 설정"
        className="flex flex-wrap items-center gap-4"
      >
        <p>
          현재 홈 템플릿: <strong data-testid="template">{template}</strong>
        </p>
        <Button variant="outline" onClick={changeTemplate}>
          홈 A 적용
        </Button>
        <Button
          variant="outline"
          onClick={() => void action("admin.posts", { site_id: MOCK_SITE_ID })}
        >
          관리자 목록 조회
        </Button>
      </section>
      <label className="block">
        카테고리
        <select
          aria-label="카테고리"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="ml-3 rounded border p-3"
        >
          <option value="">전체</option>
          {CATEGORIES.map((c) => (
            <option value={c.code} key={c.code}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <p role="status" data-testid="result">
        {message}
      </p>
      <ul className="grid gap-4 md:grid-cols-2">
        {cards.map((card) => (
          <li key={card.post_id} className="rounded-lg border bg-white p-5">
            <p className="text-sm">
              {CATEGORIES.find((c) => c.code === card.category_code)?.label}
            </p>
            <h2 className="my-3 text-xl font-medium">{card.title}</h2>
            {card.like_count !== null && (
              <p className="mb-3">
                좋아요 {card.like_count} · 댓글 {card.comment_count}
              </p>
            )}
            <Button
              variant="outline"
              onClick={() =>
                void action("post.get", {
                  site_id: MOCK_SITE_ID,
                  id: card.post_id,
                })
              }
            >
              상세 조회
            </Button>
          </li>
        ))}
      </ul>
      {!cards.length && !message && <p>등록된 여행 기록이 없습니다.</p>}
      {detail !== null && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">API 응답</h2>
          <pre
            data-testid="api-response"
            className="max-h-96 overflow-auto rounded-lg bg-white p-5 text-sm"
          >
            {JSON.stringify(detail, null, 2)}
          </pre>
        </section>
      )}
      <p className="text-sm">
        브라우저 탭마다 독립된 데이터입니다. 실제 계정·사진·DB·파일
        업로드·OAuth는 사용하지 않습니다.
      </p>
    </main>
  );
}

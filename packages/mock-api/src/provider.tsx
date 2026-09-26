"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { MockRuntime } from "./server";
import type { Scenario } from "./types";
const MockContext = createContext<MockRuntime | null>(null);
export function useMockApi() {
  return useContext(MockContext);
}
export function MockApiProvider({
  children,
  enabled,
  scenario = "default",
  supabaseUrl,
}: {
  children: ReactNode;
  enabled: boolean;
  scenario?: Scenario;
  supabaseUrl?: string;
}) {
  const active = process.env.NODE_ENV !== "production" && enabled;
  const [runtime, setRuntime] = useState<MockRuntime | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let running: MockRuntime | undefined;
    void import("./server")
      .then(({ startMockServer }) => {
        if (cancelled) return;
        const requested = new URLSearchParams(window.location.search).get(
          "mockScenario",
        );
        const selected =
          requested &&
          [
            "default",
            "empty",
            "error",
            "rate-limited",
            "slow",
            "conflict",
          ].includes(requested)
            ? (requested as Scenario)
            : scenario;
        running = startMockServer({ scenario: selected, supabaseUrl });
        setRuntime(running);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      running?.shutdown();
    };
  }, [active, scenario, supabaseUrl]);
  if (!active) return children;
  if (error)
    return (
      <p role="alert">
        Mock API를 시작하지 못했습니다. 개발 서버 로그를 확인해 주세요.
      </p>
    );
  if (!runtime) return <p role="status">예시 데이터를 준비하고 있어요…</p>;
  return (
    <MockContext.Provider value={runtime}>
      <div
        role="status"
        className="border-b bg-amber-50 px-4 py-2 text-center text-sm text-amber-950"
      >
        개발용 예시 데이터 · 새로고침하면 초기화됩니다.
      </div>
      {children}
    </MockContext.Provider>
  );
}

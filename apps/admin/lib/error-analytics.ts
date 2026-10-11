export const errorStatusLabels = {
  open: "열림",
  resolved: "해결됨",
  ignored: "무시함",
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseErrorListQuery(
  params: Record<string, string | string[] | undefined>,
) {
  const search =
    typeof params.search === "string" ? params.search.trim().toLowerCase() : "";
  const status =
    params.status === "open" ||
    params.status === "resolved" ||
    params.status === "ignored"
      ? params.status
      : "all";
  const raw =
    typeof params.page === "string" && /^\d+$/.test(params.page)
      ? Number(params.page)
      : 1;
  const page = Math.max(
    1,
    Math.min(107374181, Number.isSafeInteger(raw) ? raw : 1),
  );
  return {
    search,
    app: params.app === "web" || params.app === "admin" ? params.app : "all",
    environment: ["all", "production", "preview", "development"].includes(
      String(params.environment),
    )
      ? (params.environment as "all" | "production" | "preview" | "development")
      : search
        ? "all"
        : "production",
    period: ["all", "24h", "7d", "14d"].includes(String(params.period))
      ? (params.period as "all" | "24h" | "7d" | "14d")
      : search
        ? "all"
        : "24h",
    status,
    page,
    valid: search === "" || uuid.test(search) || /^[0-9a-f]{64}$/.test(search),
  } as const;
}
export function errorListLocation(query: {
  search: string;
  status: string;
  page: number;
  app?: string;
  environment?: string;
  period?: string;
}) {
  const params = new URLSearchParams({
    status: query.status,
    page: String(query.page),
  });
  for (const key of ["app", "environment", "period"] as const)
    if (query[key]) params.set(key, query[key]);
  if (query.search) params.set("search", query.search);
  return `/error-analytics-preview?${params}`;
}
export function supabaseDiagnosticLinks(url: string | undefined) {
  try {
    const host = new URL(url ?? "").hostname;
    const ref = /^([a-z0-9]{20})\.supabase\.co$/.exec(host)?.[1];
    return ref
      ? {
          sql: `https://supabase.com/dashboard/project/${ref}/sql/new`,
          logs: `https://supabase.com/dashboard/project/${ref}/logs/explorer`,
        }
      : null;
  } catch {
    return null;
  }
}

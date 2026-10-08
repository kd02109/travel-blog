export type ErrorService = "web" | "admin";
export type ErrorSource = "browser" | "next_server";
export type ErrorEnvironment = "development" | "preview" | "production";
export type ErrorDependency =
  | "travel_api"
  | "supabase_auth"
  | "supabase_storage"
  | "next_server"
  | "browser"
  | "other";

export type SafeStackFrame = {
  function_name: string | null;
  file: string;
  line: number;
  column: number;
};

export type CaptureOptions = {
  service: ErrorService;
  source: ErrorSource;
  route: string;
  code: string;
  endpoint?: string;
  enabled?: boolean;
  environment?: string;
  release?: string;
  reportKey?: string;
  operation?: string;
  dependency?: ErrorDependency;
  httpStatus?: number;
  originRequestId?: string;
};

/** Keep only a route template. Never send a URL, query, slug or user ID. */
export function errorRoute(path: string): string {
  const pathname = path.split(/[?#]/, 1)[0] ?? "";
  const parts = pathname.split("/").filter(Boolean);
  const section = parts[0];
  if (!section) return "/";
  if (parts.length > 1 && (section === "posts" || section === "write"))
    return `/${section}/:id`;
  const known = new Set([
    "about",
    "account",
    "account-deletions",
    "api",
    "auth",
    "comments",
    "contents",
    "error-analytics-preview",
    "forbidden",
    "home-design",
    "login",
    "mock",
    "notice",
    "posts",
    "write",
  ]);
  return known.has(section) ? `/${section}` : "/unknown";
}

function safeCode(code: string): string {
  return /^[a-z][a-z0-9_]{0,63}$/.test(code) ? code : "unknown_error";
}

function safeDigest(error: unknown): string | undefined {
  try {
    if (!error || typeof error !== "object" || !("digest" in error)) return;
    const digest = error.digest;
    return typeof digest === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(digest)
      ? digest
      : undefined;
  } catch {
    return;
  }
}

function safeName(error: unknown): string {
  try {
    const name = error instanceof Error ? error.name : "Error";
    return /^[A-Za-z][A-Za-z0-9_.]{0,63}$/.test(name) ? name : "Error";
  } catch {
    return "Error";
  }
}

function safeDetail(
  error: unknown,
  field: "message" | "stack",
  maxLength: number,
) {
  try {
    return error instanceof Error
      ? maskErrorText(error[field], maxLength)
      : null;
  } catch {
    return null;
  }
}

const identifierPattern = /^[a-z][a-z0-9_.-]{0,63}$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const frameFilePattern = /^[A-Za-z0-9_./-]{1,160}$/;
const frameFunctionPattern = /^[A-Za-z0-9_$<>.-]{1,80}$/;
const frameFilePrefixes = [
  "_next/static/chunks/",
  ".next/server/",
  "apps/web/",
  "apps/admin/",
  "packages/",
  "app/",
  "pages/",
  "src/",
];
const dependencies = new Set<ErrorDependency>([
  "travel_api",
  "supabase_auth",
  "supabase_storage",
  "next_server",
  "browser",
  "other",
]);

export function safeOriginRequestId(value: unknown): string | null {
  return typeof value === "string" && uuidPattern.test(value)
    ? value.toLowerCase()
    : null;
}

export function originRequestIdFromError(error: unknown): string | null {
  return safeOriginRequestId(errorProperty(error, "requestId"));
}

function errorProperty(error: unknown, property: string): unknown {
  try {
    return error && typeof error === "object" && property in error
      ? (error as Record<string, unknown>)[property]
      : undefined;
  } catch {
    return undefined;
  }
}

export function safeErrorOperation(value: unknown): string | null {
  return typeof value === "string" && identifierPattern.test(value)
    ? value
    : null;
}

export function safeErrorDependency(value: unknown): ErrorDependency | null {
  return typeof value === "string" && dependencies.has(value as ErrorDependency)
    ? (value as ErrorDependency)
    : null;
}

export function safeHttpStatus(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 100 &&
    value <= 599
    ? value
    : null;
}

function safeFrameFile(value: unknown): string | null {
  if (typeof value !== "string" || !frameFilePattern.test(value)) return null;
  if (value.startsWith("/") || value.includes("..") || value.includes("//"))
    return null;
  return frameFilePrefixes.some((prefix) => value.startsWith(prefix))
    ? value
    : null;
}

/** Drop forged or unsafe frame fields at each report boundary. */
export function sanitizeStackFrames(value: unknown): SafeStackFrame[] {
  if (!Array.isArray(value)) return [];
  const frames: SafeStackFrame[] = [];
  for (const candidate of value.slice(0, 10)) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
      continue;
    const frame = candidate as Record<string, unknown>;
    const file = safeFrameFile(frame.file);
    const line = frame.line;
    const column = frame.column;
    if (
      !file ||
      typeof line !== "number" ||
      !Number.isInteger(line) ||
      line < 1 ||
      line > 10_000_000 ||
      typeof column !== "number" ||
      !Number.isInteger(column) ||
      column < 1 ||
      column > 10_000_000
    )
      continue;
    const functionName =
      typeof frame.function_name === "string" &&
      frameFunctionPattern.test(frame.function_name)
        ? frame.function_name
        : null;
    frames.push({ function_name: functionName, file, line, column });
  }
  return frames;
}

function frameFileFromLocation(location: string): string | null {
  try {
    let path = location;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) path = new URL(path).pathname;
    else path = path.split(/[?#]/, 1)[0] ?? "";
    const markers = [
      "/_next/static/chunks/",
      "/.next/server/",
      "/apps/web/",
      "/apps/admin/",
      "/packages/",
      "/app/",
      "/pages/",
      "/src/",
    ];
    for (const marker of markers) {
      const index = path.lastIndexOf(marker);
      if (index >= 0) return safeFrameFile(path.slice(index + 1));
    }
    return safeFrameFile(path.replace(/^\.\//, ""));
  } catch {
    return null;
  }
}

/** Preserve build file and generated position, never host, query or local path. */
export function parseSafeStackFrames(stack: unknown): SafeStackFrame[] {
  if (typeof stack !== "string" || stack.length > 65536) return [];
  const frames: SafeStackFrame[] = [];
  for (const rawLine of stack.split(/\r?\n/).slice(0, 40)) {
    if (frames.length === 10) break;
    let line = rawLine.trim().replace(/^at\s+/, "");
    let functionName: string | null = null;
    const open = line.lastIndexOf(" (");
    if (open >= 0 && line.endsWith(")")) {
      functionName = line.slice(0, open).replace(/^async\s+/, "");
      line = line.slice(open + 2, -1);
    } else if (line.includes("@")) {
      const at = line.lastIndexOf("@");
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(line.slice(at + 1))) {
        functionName = line.slice(0, at);
        line = line.slice(at + 1);
      }
    }
    const location = line.match(/^(.*):([1-9]\d*):([1-9]\d*)$/);
    if (!location) continue;
    const file = frameFileFromLocation(location[1] ?? "");
    if (!file) continue;
    const lineNumber = Number(location[2]);
    const columnNumber = Number(location[3]);
    if (lineNumber > 10_000_000 || columnNumber > 10_000_000) continue;
    frames.push({
      function_name:
        functionName && frameFunctionPattern.test(functionName)
          ? functionName
          : null,
      file,
      line: lineNumber,
      column: columnNumber,
    });
  }
  return frames;
}

/**
 * Retain useful exception text without retaining common credentials or personal
 * identifiers. This is deliberately applied again by the relay and Edge API:
 * callers can forge a browser report. Never use it for request bodies or logs.
 */
export function maskErrorText(
  value: unknown,
  maxLength: number,
): string | null {
  if (typeof value !== "string" || !value || value.length > 65536) return null;
  try {
    const masked = value
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\[[0-9;]*m/g, "")
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x09\x0b-\x1f\x7f]/g, " ")
      .replace(
        /\b(?:authorization|proxy-authorization|set-cookie|cookie)\s*[:=]\s*[^\r\n]+/gi,
        "[credential]",
      )
      .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*/gi, "[credential]")
      .replace(/\b(?:https?|wss?|file):\/\/[^\s<>"'`)}\]]+/gi, "[url]")
      .replace(
        /\b[A-Z]:\\(?:Users|Documents and Settings)\\[^\s):]+/gi,
        "[path]",
      )
      .replace(
        /\/(?:Users|home|workspace|private|var|tmp)\/[^\s):]+/g,
        "[path]",
      )
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
      .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]")
      .replace(
        /\b(?:sb_(?:secret|publishable|service_role|anon)_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})\b/g,
        "[credential]",
      )
      .replace(
        /\b(?:access[_-]?token|refresh[_-]?token|id[_-]?token|token|password|passwd|secret|api[_-]?key|client[_-]?secret|auth[_-]?code|code|state|signature|session(?:_id)?)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;}\]]+)/gi,
        "[credential]",
      )
      .replace(
        /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
        "[id]",
      )
      .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[opaque]")
      .trim();
    return masked ? masked.slice(0, maxLength) : null;
  } catch {
    return null;
  }
}

/**
 * Best-effort telemetry. Only masked Error.message/stack are serialized; never
 * include request headers, body, cookies, user identifiers or the full URL.
 */
export async function captureException(
  error: unknown,
  options: CaptureOptions,
): Promise<void> {
  if (!options.enabled || !options.endpoint) return;
  const environment: ErrorEnvironment =
    options.environment === "production" || options.environment === "preview"
      ? options.environment
      : "development";
  const release =
    options.release && /^[a-zA-Z0-9._-]{1,80}$/.test(options.release)
      ? options.release
      : "unknown";
  const input = {
    app: options.service,
    environment,
    source: options.source,
    route: errorRoute(options.route),
    error_name: safeName(error),
    code: safeCode(options.code),
    digest: safeDigest(error) ?? null,
    release,
    masked_message: safeDetail(error, "message", 1024),
    masked_stack: safeDetail(error, "stack", 4096),
    stack_frames: parseSafeStackFrames(errorProperty(error, "stack")),
    operation:
      safeErrorOperation(errorProperty(error, "operation")) ??
      safeErrorOperation(options.operation) ??
      safeCode(options.code),
    dependency:
      safeErrorDependency(options.dependency) ??
      (safeName(error) === "TravelApiError"
        ? "travel_api"
        : options.source === "next_server"
          ? "next_server"
          : "browser"),
    http_status:
      safeHttpStatus(options.httpStatus) ??
      safeHttpStatus(errorProperty(error, "status")),
    origin_request_id:
      originRequestIdFromError(error) ??
      safeOriginRequestId(options.originRequestId),
  };
  try {
    await fetch(options.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(options.reportKey
          ? { "X-Error-Report-Key": options.reportKey }
          : {}),
      },
      body: JSON.stringify({ action: "error.capture", input }),
      credentials: "omit",
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
  } catch {
    // Monitoring must never break the page or enter its own reporting loop.
  }
}

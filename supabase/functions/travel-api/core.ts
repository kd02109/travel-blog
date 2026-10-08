export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}
export function databaseError(error: { code?: string; message?: string }) {
  const code = error.code ?? "";
  const status = /^PT[0-9]{3}$/.test(code)
    ? Number(code.slice(2))
    : code === "23505"
      ? 409
      : /^(22|23)/.test(code)
        ? 422
        : 500;
  const message = status === 500
    ? "internal_error"
    : /^PT/.test(code)
      ? error.message ?? "invalid_or_conflicting_input"
      : code === "22007" || code === "22008"
        ? "invalid_date"
        : "invalid_or_conflicting_input";
  return new ApiError(status, message);
}
/** Map the public error envelope to the SQL function's strict allowlist. */
export function errorCaptureSqlInput(
  siteId: string,
  report: {
    app: string;
    environment: string;
    source: string;
    route: string;
    error_name: string;
    code: string;
    release: string;
    masked_message?: string | null;
    masked_stack?: string | null;
    operation?: string | null;
    dependency?: ErrorDependency | null;
    http_status?: number | null;
    origin_request_id?: string | null;
    stack_frames?: ErrorStackFrame[];
  },
  fingerprint: string,
  requestId: string,
) {
  return {
    site_id: siteId,
    app: report.app,
    environment: report.environment,
    source: report.source,
    route: report.route,
    error_name: report.error_name,
    message: report.code,
    fingerprint,
    release: report.release,
    request_id: requestId,
    ...(report.masked_message !== undefined
      ? { masked_message: report.masked_message }
      : {}),
    ...(report.masked_stack !== undefined
      ? { masked_stack: report.masked_stack }
      : {}),
    operation: report.operation ?? null,
    dependency: report.dependency ?? null,
    http_status: report.http_status ?? null,
    origin_request_id: report.origin_request_id ?? null,
    stack_frames: report.stack_frames ?? [],
  };
}

export type ErrorDependency =
  | "travel_api"
  | "supabase_auth"
  | "supabase_storage"
  | "next_server"
  | "browser"
  | "other";

export type ErrorStackFrame = {
  function_name: string | null;
  file: string;
  line: number;
  column: number;
};

const errorSourcePrefixes = [
  "_next/static/chunks/",
  ".next/server/",
  "apps/web/",
  "apps/admin/",
  "packages/",
  "app/",
  "pages/",
  "src/",
];

/** Validate low-cardinality context and path-free stack locations. */
export function validatedErrorContext(input: Record<string, unknown>): {
  operation: string | null;
  dependency: ErrorDependency | null;
  http_status: number | null;
  origin_request_id: string | null;
  stack_frames: ErrorStackFrame[];
} {
  const invalid = () => {
    throw new ApiError(400, "invalid_error_report");
  };
  const optionalString = (value: unknown, pattern: RegExp) => {
    if (value === undefined || value === null) return null;
    if (typeof value !== "string" || !pattern.test(value)) invalid();
    return value as string;
  };
  const operation = optionalString(input.operation, /^[a-z][a-z0-9_.-]{0,63}$/);
  const dependency = optionalString(
    input.dependency,
    /^(travel_api|supabase_auth|supabase_storage|next_server|browser|other)$/,
  ) as ErrorDependency | null;
  const origin_request_id = optionalString(
    input.origin_request_id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );
  const http_status = input.http_status === undefined || input.http_status === null
    ? null
    : input.http_status;
  if (
    http_status !== null &&
    (!Number.isInteger(http_status) || (http_status as number) < 100 ||
      (http_status as number) > 599)
  ) invalid();
  const stack_frames = input.stack_frames === undefined || input.stack_frames === null
    ? []
    : input.stack_frames;
  if (!Array.isArray(stack_frames) || stack_frames.length > 10) invalid();
  for (const frame of stack_frames as unknown[]) {
    if (!frame || typeof frame !== "object" || Array.isArray(frame)) invalid();
    const data = frame as Record<string, unknown>;
    const file = data.file;
    if (
      Object.keys(data).length !== 4 ||
      Object.keys(data).some((key) =>
        !["function_name", "file", "line", "column"].includes(key)
      ) ||
      (data.function_name !== null &&
        (typeof data.function_name !== "string" ||
          !/^[A-Za-z0-9_$<>.-]{1,80}$/.test(data.function_name))) ||
      typeof file !== "string" ||
      !/^[A-Za-z0-9_./-]{1,160}$/.test(file) ||
      file.startsWith("/") || file.includes("..") ||
      file.includes("//") ||
      !errorSourcePrefixes.some((prefix) => file.startsWith(prefix)) ||
      !Number.isInteger(data.line) || (data.line as number) < 1 ||
      (data.line as number) > 10_000_000 ||
      !Number.isInteger(data.column) || (data.column as number) < 1 ||
      (data.column as number) > 10_000_000
    ) invalid();
  }
  return {
    operation,
    dependency,
    http_status: http_status as number | null,
    origin_request_id,
    stack_frames: stack_frames as ErrorStackFrame[],
  };
}

/** Re-mask diagnostic text at the trusted gateway boundary. */
export function maskedDiagnosticText(
  value: unknown,
  maximumLength: number,
): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || value.length > maximumLength) {
    throw new ApiError(400, "invalid_error_report");
  }
  const masked = value
    .replace(/\x1b\[[0-9;]*m/g, "")
    .replace(/[\x00-\x09\x0b-\x1f\x7f]/g, " ")
    .replace(
      /\b(?:authorization|proxy-authorization|set-cookie|cookie)\s*[:=]\s*[^\r\n]+/gi,
      "[credential]",
    )
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*/gi, "[credential]")
    .replace(/\b(?:https?|wss?|file):\/\/[^\s<>"'`)}\]]+/gi, "[url]")
    .replace(/\b[A-Z]:\\(?:Users|Documents and Settings)\\[^\s):]+/gi, "[path]")
    .replace(/\/(?:Users|home|workspace|root|private|var|tmp)\/[^\s):]+/g, "[path]")
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
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[id]")
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[opaque]")
    .trim();
  return masked || null;
}
export const publicActions = new Set([
  "site.get",
  "posts.list",
  "post.get",
  "comments.list",
  "asset.access",
  "visitor.create",
  "error.capture",
]);
export const guestActions = new Set([
  "comment.create",
  "comment.edit",
  "comment.delete",
  "like.get",
  "like.set",
]);
export const memberActions = new Set([
  "me",
  "profile.save",
  "account.delete.request",
  "comment.report",
  "admin.posts",
  "admin.post.get",
  "admin.post.published",
  "admin.post.create",
  "admin.post.save",
  "admin.post.publish",
  "admin.post.status",
  "admin.revisions",
  "admin.revision.get",
  "admin.revision.restore",
  "admin.revision.delete",
  "admin.members",
  "admin.member.set",
  "admin.settings.get",
  "admin.settings.save",
  "admin.settings.apply",
  "admin.comments",
  "admin.account.deletions",
  "admin.account.deletion.anonymize",
  "admin.account.deletion.complete",
  "admin.comment.moderate",
  "admin.reports",
  "admin.report.resolve",
  "admin.audit",
  "admin.errors",
  "admin.error.get",
  "asset.create",
  "asset.complete",
  "asset.status",
  "asset.cancel",
  "asset.list",
  "asset.delete",
]);
export function validateAction(action: unknown): string {
  if (
    typeof action !== "string" ||
    !publicActions.has(action) && !guestActions.has(action) &&
      !memberActions.has(action)
  ) throw new ApiError(400, "unknown_action");
  return action;
}
export function cleanInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ApiError(400, "invalid_input");
  }
  const data = { ...input as Record<string, unknown> };
  for (
    const key of [
      "actor_hash",
      "password_hash",
      "guest_verified",
      "request_hash",
      "rendered_html",
      "asset_ids",
      "p_actor",
    ]
  ) delete data[key];
  for (
    const key of [
      "id",
      "site_id",
      "user_id",
      "revision_id",
      "parent_id",
      "request_key",
    ]
  ) {
    const value = data[key];
    if (
      value !== undefined && value !== null &&
      (typeof value !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          value,
        ))
    ) throw new ApiError(400, "invalid_" + key);
  }
  return data;
}
export function text(value: unknown, min: number, max: number): string {
  if (
    typeof value !== "string" || [...value].length < min ||
    [...value].length > max || value.trim().length === 0
  ) throw new ApiError(422, "invalid_text");
  return value;
}
export const escapeHtml = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]!),
  );
export function renderBlocks(
  blocks: unknown,
): { html: string; assetIds: string[] } {
  const ids = new Set<string>();
  let nodes = 0;
  function inline(value: unknown): string {
    if (typeof value === "string") return escapeHtml(value);
    if (!Array.isArray(value)) {
      throw new ApiError(422, "invalid_inline_content");
    }
    return value.map((item) => {
      if (!item || typeof item !== "object") {
        throw new ApiError(422, "invalid_inline_content");
      }
      if (item.type === "link") {
        const href = text(item.href, 1, 2048);
        let url: URL;
        try {
          url = new URL(href);
        } catch {
          throw new ApiError(422, "invalid_link");
        }
        if (!["http:", "https:"].includes(url.protocol)) {
          throw new ApiError(422, "invalid_link");
        }
        return `<a href="${
          escapeHtml(url.href)
        }" rel="nofollow noopener noreferrer">${inline(item.content)}</a>`;
      }
      if (item.type !== "text" || typeof item.text !== "string") {
        throw new ApiError(422, "unsupported_inline_type");
      }
      let t = escapeHtml(item.text);
      const styles = item.styles ?? {};
      for (
        const [key, tag] of [
          ["bold", "strong"],
          ["italic", "em"],
          ["underline", "u"],
          ["strike", "s"],
          ["code", "code"],
        ] as const
      ) if (styles[key]) t = `<${tag}>${t}</${tag}>`;
      return t;
    }).join("");
  }
  function render(items: unknown, depth: number): string {
    if (!Array.isArray(items) || depth > 8) {
      throw new ApiError(422, "invalid_blocks");
    }
    let html = "";
    let pairedImage: {
      html: string;
      sharePct: number | null;
      widthWeight: number;
    } | null = null;
    const flushPair = () => {
      if (pairedImage) html += pairedImage.html;
      pairedImage = null;
    };
    for (const b of items) {
      if (!b || typeof b !== "object" || ++nodes > 2000) {
        throw new ApiError(422, "invalid_blocks");
      }
      let out = "";
      let pair = false;
      let pairSharePct: number | null = null;
      let pairWidthWeight = 100;
      const content = () => inline(b.content ?? []);
      switch (b.type) {
        case "paragraph":
          out = `<p>${content()}</p>`;
          break;
        case "heading": {
          const level = Number(b.props?.level ?? 2);
          if (![1, 2, 3, 4, 5, 6].includes(level)) {
            throw new ApiError(422, "invalid_heading");
          }
          out = `<h${level}>${content()}</h${level}>`;
          break;
        }
        case "bulletListItem":
          out = `<ul><li>${content()}</li></ul>`;
          break;
        case "numberedListItem":
          out = `<ol><li>${content()}</li></ol>`;
          break;
        case "quote":
          out = `<blockquote>${content()}</blockquote>`;
          break;
        case "codeBlock":
          out = `<pre><code>${content()}</code></pre>`;
          break;
        case "divider":
          out = "<hr>";
          break;
        case "image": {
          const id = b.props?.asset_id;
          if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) {
            throw new ApiError(422, "image_asset_required");
          }
          ids.add(id);
          const width = ["small", "medium", "large"].includes(b.props?.width)
            ? b.props.width
            : "large";
          const align = ["left", "center", "right"].includes(b.props?.align)
            ? b.props.align
            : "center";
          const layout = b.props?.layout === "pair" ? "pair" : "single";
          const widthPct = b.props?.width_pct;
          const positionPct = b.props?.position_pct;
          const sharePct = b.props?.pair_share_pct;
          if (
            typeof sharePct === "number" && Number.isFinite(sharePct) &&
            sharePct >= 20 && sharePct <= 80
          ) pairSharePct = sharePct;
          if (
            typeof widthPct === "number" && Number.isFinite(widthPct) &&
            widthPct >= 20 && widthPct <= 100
          ) pairWidthWeight = widthPct;
          const customLayout =
            typeof widthPct === "number" && Number.isFinite(widthPct) &&
            widthPct >= 20 && widthPct <= 100 &&
            typeof positionPct === "number" && Number.isFinite(positionPct) &&
            positionPct >= 0 && positionPct <= 100;
          const customAttributes = customLayout
            ? (() => {
              const safeWidth = Math.round(widthPct * 10) / 10;
              const safePosition = Math.round(positionPct * 10) / 10;
              const offset = Math.round(
                (100 - safeWidth) * safePosition,
              ) / 100;
              return ` data-image-custom="true" data-image-width-pct="${safeWidth}" data-image-position-pct="${safePosition}" style="--image-width:${safeWidth}%;--image-offset:${offset}%"`;
            })()
            : "";
          pair = layout === "pair";
          out = `<figure data-asset-id="${id}" data-image-width="${width}" data-image-align="${align}" data-image-layout="${layout}"${customAttributes}><figcaption>${
            escapeHtml(String(b.props?.caption ?? ""))
          }</figcaption></figure>`;
          break;
        }
        default:
          throw new ApiError(422, "unsupported_block_type");
      }
      out += b.children?.length ? render(b.children, depth + 1) : "";
      if (pair) {
        if (pairedImage) {
          const firstShare = pairedImage.sharePct ??
            (pairSharePct === null
              ? Math.min(
                80,
                Math.max(
                  20,
                  100 * pairedImage.widthWeight /
                    (pairedImage.widthWeight + pairWidthWeight),
                ),
              )
              : 100 - pairSharePct);
          const safeShare = Math.round(firstShare * 10) / 10;
          html += `<div data-image-pair data-pair-first-pct="${safeShare}" style="--pair-first:${safeShare}%">${pairedImage.html}${out}</div>`;
          pairedImage = null;
        } else {
          pairedImage = {
            html: out,
            sharePct: pairSharePct,
            widthWeight: pairWidthWeight,
          };
        }
      } else {
        flushPair();
        html += out;
      }
    }
    flushPair();
    return html;
  }
  return { html: render(blocks, 0), assetIds: [...ids] };
}
export function sniff(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)) {
    return "image/png";
  }
  const h = new TextDecoder().decode(bytes.slice(0, 12));
  if (h.startsWith("RIFF") && h.slice(8, 12) === "WEBP") return "image/webp";
  if (h.startsWith("%PDF-")) return "application/pdf";
  throw new ApiError(422, "unsupported_file");
}

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
export const publicActions = new Set([
  "site.get",
  "posts.list",
  "post.get",
  "comments.list",
  "asset.access",
  "visitor.create",
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
  "asset.create",
  "asset.complete",
  "asset.status",
  "asset.cancel",
  "asset.list",
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
    let pairedImage = "";
    const flushPair = () => {
      html += pairedImage;
      pairedImage = "";
    };
    for (const b of items) {
      if (!b || typeof b !== "object" || ++nodes > 2000) {
        throw new ApiError(422, "invalid_blocks");
      }
      let out = "";
      let pair = false;
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
          pair = layout === "pair";
          out = `<figure data-asset-id="${id}" data-image-width="${width}" data-image-align="${align}" data-image-layout="${layout}"><figcaption>${
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
          html += `<div data-image-pair>${pairedImage}${out}</div>`;
          pairedImage = "";
        } else {
          pairedImage = out;
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

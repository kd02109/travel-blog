import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { argon2id, argon2Verify } from "npm:hash-wasm@4.12.0";
import {
  ApiError,
  databaseError,
  cleanInput,
  guestActions,
  memberActions,
  renderBlocks,
  sniff,
  text,
  validateAction,
} from "./core.ts";
const base = Deno.env.get("SUPABASE_URL")!;
const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const client = createClient(base, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const encoder = new TextEncoder();
const hmacKey = await crypto.subtle.importKey(
  "raw",
  encoder.encode(secret),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign", "verify"],
);
const hex = (data: ArrayBuffer) =>
  Array.from(new Uint8Array(data), (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
const hmac = async (s: string) =>
  hex(
    await crypto.subtle.sign(
      "HMAC",
      hmacKey,
      encoder.encode("travel-blog:v1:" + s),
    ),
  );
const sha = async (s: string) =>
  hex(await crypto.subtle.digest("SHA-256", encoder.encode(s)));
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info, x-visitor-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Expose-Headers": "Retry-After, X-Request-Id",
};
async function rpc(
  action: string,
  actor: string | null,
  input: Record<string, unknown>,
): Promise<any> {
  const { data, error } = await client.rpc(
    action === "admin.posts"
      ? "travel_admin_posts"
      : action === "admin.comments"
      ? "travel_admin_comments"
      : action === "account.delete.request"
      ? "travel_account_delete_request"
      : action === "admin.account.deletions"
      ? "travel_admin_account_deletions"
      : action === "admin.account.deletion.anonymize"
      ? "travel_admin_account_deletion_anonymize"
      : action === "admin.account.deletion.complete"
      ? "travel_admin_account_deletion_complete"
      : "travel_api",
    action === "admin.posts"
      ? { p_actor: actor, p_input: input }
      : action === "admin.comments"
      ? {
        p_actor: actor,
        p_site_id: input.site_id,
        p_limit: input.limit,
        p_offset: input.offset,
      }
      : action === "account.delete.request"
      ? { p_actor: actor }
      : action === "admin.account.deletions"
      ? { p_actor: actor, p_site_id: input.site_id }
      : action === "admin.account.deletion.anonymize" ||
          action === "admin.account.deletion.complete"
      ? { p_actor: actor, p_site_id: input.site_id, p_request_id: input.id }
      : {
    p_action: action,
    p_actor: actor,
    p_input: input,
        },
  );
  if (error) {
    throw databaseError(error);
  }
  return data;
}
async function rate(key: string, action: string, max: number, seconds = 60) {
  const r = await rpc("rate.consume", null, {
    key_hash: await hmac(key),
    action,
    max,
    window_seconds: seconds,
  });
  if (!r.allowed) throw new ApiError(429, "rate_limited", r.retry_after);
}
async function visitor(req: Request): Promise<string> {
  const token = req.headers.get("x-visitor-token") ??
    req.headers.get("cookie")?.match(/(?:^|;\s*)travel_visitor=([^;]+)/)?.[1];
  if (!token) throw new ApiError(401, "visitor_required");
  const [id, expires, signature, ...rest] = token.split(".");
  if (
    rest.length || !/^[0-9a-f-]{36}$/.test(id ?? "") ||
    !/^\d{10}$/.test(expires ?? "") || !signature || signature.length !== 64 ||
    Number(expires) < Date.now() / 1000
  ) throw new ApiError(401, "invalid_visitor");
  const actual = await hmac("visitor:" + id + "." + expires);
  let mismatch = 0;
  for (let i = 0; i < actual.length; i++) {
    mismatch |= actual.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  if (mismatch) throw new ApiError(401, "invalid_visitor");
  return await hmac("actor:" + id);
}
async function readJson(req: Request): Promise<any> {
  if (!req.headers.get("content-type")?.includes("application/json")) {
    throw new ApiError(415, "json_required");
  }
  if (Number(req.headers.get("content-length") ?? 0) > 1100000) {
    throw new ApiError(413, "request_too_large");
  }
  const reader = req.body?.getReader();
  if (!reader) throw new ApiError(400, "invalid_json");
  let size = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 1100000) {
      await reader.cancel();
      throw new ApiError(413, "request_too_large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) {
    bytes.set(c, off);
    off += c.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiError(400, "invalid_json");
  }
}
Deno.serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  const respond = (
    data: unknown,
    status = 200,
    extra: Record<string, string> = {},
  ) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        ...cors,
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Request-Id": requestId,
        ...extra,
      },
    });
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method === "GET") {
    return respond({ service: "travel-api", version: 1, status: "ok" });
  }
  if (req.method !== "POST") {
    return respond({ error: "method_not_allowed" }, 405);
  }
  try {
    const body = await readJson(req);
    const action = validateAction(body?.action);
    const input = cleanInput(body?.input ?? {});
    let actor: string | null = null;
    const authorization = req.headers.get("authorization");
    if (authorization) {
      const match = authorization.match(/^Bearer ([^\s]+)$/i);
      if (!match) throw new ApiError(401, "invalid_authorization");
      const { data, error } = await client.auth.getUser(match[1]);
      if (error || !data.user || data.user.is_anonymous) {
        throw new ApiError(401, "invalid_session");
      }
      actor = data.user.id;
    }
    if (memberActions.has(action) && !actor) {
      throw new ApiError(401, "login_required");
    }
    // Deployment-wide cap complements per-actor limits; untrusted forwarded IP headers are not used as identity.
    await rate("gateway", "request", 1200);
    if (action === "visitor.create") {
      await rate("gateway", "visitor", 120);
      const id = crypto.randomUUID(),
        exp = String(Math.floor(Date.now() / 1000) + 2592000);
      const token = id + "." + exp + "." +
        await hmac("visitor:" + id + "." + exp);
      return respond({ visitor_token: token, expires_at: Number(exp) }, 200, {
        "Set-Cookie":
          `travel_visitor=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`,
      });
    }
    let actorHash = actor ? "user:" + actor : null;
    if (guestActions.has(action) && !actor) {
      actorHash = await visitor(req);
      input.actor_hash = actorHash;
    }
    if (actorHash) {
      const group = action.startsWith("comment.")
        ? "comment"
        : action === "like.set" || action === "like.get"
        ? "like"
        : "admin";
      await rate(
        actorHash,
        group,
        group === "comment" ? 10 : group === "like" ? 30 : 180,
      );
      if (action === "comment.create") {
        await rate(actorHash, "comment-create", 3);
        await rate(actorHash, "comment-daily", 30, 86400);
      }
      if (action === "account.delete.request") {
        await rate(actorHash, "account-delete", 2, 86400);
      }
    }
    if (action === "comment.create") {
      input.body = text(input.body, 1, 1000).trim();
      if (!input.request_key) throw new ApiError(422, "request_key_required");
      if (!actor) {
        input.guest_name = text(input.guest_name, 2, 30).trim();
        const password = text(input.password, 8, 128);
        input.password_hash = await argon2id({
          password,
          salt: crypto.getRandomValues(new Uint8Array(16)),
          parallelism: 1,
          iterations: 2,
          memorySize: 19456,
          hashLength: 32,
          outputType: "encoded",
        });
      }
      input.request_hash = await sha(
        JSON.stringify([
          input.body,
          input.parent_id ?? null,
          actor ? null : input.guest_name,
        ]),
      );
    }
    if (action === "comment.edit" || action === "comment.delete") {
      if (action === "comment.edit") {
        input.body = text(input.body, 1, 1000).trim();
      }
      if (!actor || input.password !== undefined) {
        // Comment-wide limit prevents a fresh visitor token from resetting guessing limits.
        await rate("credential:" + input.id, "verify", 5, 900);
        const credential = await rpc("comment.credential", null, {
          id: input.id,
        });
        const password = text(input.password, 8, 128);
        if (
          !credential?.password_hash ||
          !await argon2Verify({ password, hash: credential.password_hash })
        ) throw new ApiError(403, "invalid_password");
        input.guest_verified = true;
      }
    }
    delete input.password;
    if (action === "admin.post.publish") {
      const draft = await rpc("admin.post.get", actor, {
        id: input.id,
        site_id: input.site_id,
      });
      if (draft.lock_version !== input.version) {
        throw new ApiError(409, "version_conflict");
      }
      const rendered = draft.kind === "article"
        ? renderBlocks(draft.draft_content.blocks)
        : { html: null, assetIds: [] };
      input.rendered_html = rendered.html;
      input.asset_ids = rendered.assetIds;
    }
    if (action === "asset.create") {
      const asset = await rpc(action, actor, input);
      const { data, error } = await client.storage.from(asset.bucket)
        .createSignedUploadUrl(asset.object_path, { upsert: false });
      if (error) throw new ApiError(502, "upload_url_failed");
      return respond({
        id: asset.id,
        bucket: asset.bucket,
        upload_url: data.signedUrl,
        token: data.token,
        path: data.path,
      });
    }
    if (action === "like.get") {
      const { data, error } = await client.rpc("travel_like_get", {
        p_actor: actor,
        p_actor_hash: actorHash,
        p_post_id: input.id,
      });
      if (error) throw databaseError(error);
      return respond(data);
    }
    if (action === "asset.complete") {
      const asset = await rpc("asset.internal", actor, {
        id: input.id,
        site_id: input.site_id,
      });
      if (asset.state !== "uploading" && asset.state !== "failed") {
        return respond({ id: asset.id, state: asset.state });
      }
      const { data, error } = await client.storage.from(asset.bucket).download(
        asset.object_path,
      );
      if (error || !data) throw new ApiError(422, "uploaded_file_missing");
      if (data.size === 0 || data.size > 20971520) {
        throw new ApiError(422, "invalid_file_size");
      }
      const bytes = new Uint8Array(await data.arrayBuffer());
      const mime = sniff(bytes);
      if ((asset.kind === "pdf") !== (mime === "application/pdf")) {
        throw new ApiError(422, "file_kind_mismatch");
      }
      input.metadata = {
        mime,
        bytes: bytes.length,
        checksum: hex(await crypto.subtle.digest("SHA-256", bytes)),
      };
      const result = await rpc(action, actor, input);
      return respond({ id: result.id, state: result.state });
    }
    if (action === "asset.status") {
      const asset = await rpc("asset.internal", actor, input);
      return respond({ id: asset.id, state: asset.state });
    }
    if (action === "asset.cancel") {
      const asset = await rpc("asset.internal", actor, input);
      if (asset.state === "uploading" || asset.state === "processing") {
        const { error } = await client.rpc("travel_worker", {
          p_action: "cancel",
          p_input: { id: asset.id },
        });
        if (error) throw new ApiError(500, "asset_cancel_failed");
      }
      return respond({ saved: true });
    }
    if (action === "asset.access") {
      const { data: publishedHomeAsset, error: homeAssetError } = await client.rpc(
        "travel_home_asset",
        { p_site_id: input.site_id ?? null, p_asset_id: input.id },
      );
      // Preserve access to existing single-photo covers while the migration is
      // rolling out; secondary photos become public once the RPC is installed.
      if (homeAssetError && homeAssetError.code !== "PGRST202")
        throw databaseError(homeAssetError);
      const asset = publishedHomeAsset ?? await rpc(action, actor, input);
      if (asset.cleanup_state !== "active") {
        throw new ApiError(404, "asset_not_found");
      }
      const { data, error } = await client.storage.from(asset.bucket)
        .createSignedUrl(asset.object_path, 300);
      if (error) throw new ApiError(502, "download_url_failed");
      return respond({
        id: asset.id,
        url: data.signedUrl,
        expires_in: 300,
        metadata: asset.metadata,
        preview_asset_id: asset.preview_asset_id,
      });
    }
    return respond(await rpc(action, actor, input));
  } catch (error) {
    if (error instanceof ApiError) {
      return respond(
        { error: error.message, request_id: requestId },
        error.status,
        error.status === 429
          ? { "Retry-After": String(error.retryAfter ?? 60) }
          : {},
      );
    }
    // Never log input, JWTs, passwords or internal database errors.
    console.error(
      JSON.stringify({ request_id: requestId, error: "unhandled_error" }),
    );
    return respond({ error: "internal_error", request_id: requestId }, 500);
  }
});

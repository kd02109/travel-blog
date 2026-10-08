import assert from "node:assert/strict";
import test from "node:test";
import { corsHeaders, corsOriginAllowed, parseAllowedOrigins } from "./cors.ts";

test("accepts exact HTTPS origins and localhost development origins only", () => {
  const allowed = parseAllowedOrigins(
    "https://blog.example.com, http://localhost:3000, http://127.0.0.1:3002, https://blog.example.com/, http://untrusted.example, *, null",
  );
  assert.deepEqual(
    [...allowed],
    [
      "https://blog.example.com",
      "http://localhost:3000",
      "http://127.0.0.1:3002",
    ],
  );
});

test("preflight and response headers echo only an allowed browser Origin", () => {
  const allowed = parseAllowedOrigins("https://blog.example.com");
  assert.equal(corsOriginAllowed("https://blog.example.com", allowed), true);
  assert.equal(
    corsHeaders("https://blog.example.com", allowed)[
      "Access-Control-Allow-Origin"
    ],
    "https://blog.example.com",
  );
  assert.equal(corsHeaders("https://blog.example.com", allowed).Vary, "Origin");
  assert.equal(corsOriginAllowed("https://untrusted.example", allowed), false);
  assert.equal(
    corsHeaders("https://untrusted.example", allowed)[
      "Access-Control-Allow-Origin"
    ],
    undefined,
  );
  assert.equal(corsOriginAllowed("null", allowed), false);
});

test("server-to-server requests without Origin stay available", () => {
  const allowed = parseAllowedOrigins("");
  assert.equal(corsOriginAllowed(null, allowed), true);
  assert.equal(
    corsHeaders(null, allowed)["Access-Control-Allow-Origin"],
    undefined,
  );
});

"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";
import { supabaseConfig } from "./config";
export function createBrowserDatabase() {
  const { url, key } = supabaseConfig();
  return createBrowserClient<Database>(url, key);
}

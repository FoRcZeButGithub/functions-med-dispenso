// supabase/functions/_shared/mod.ts
// Shared utilities: CORS headers + JSON helpers + service-role client + hash

import { createClient } from "jsr:@supabase/supabase-js@2";

export const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-device-key",
};

// alias ไว้รองรับโค้ดเก่า
export const corsHeaders = CORS;

export function json(data: unknown, init: number | ResponseInit = 200) {
  const base = typeof init === "number" ? { status: init } : init;
  const headers = new Headers(base.headers ?? {});
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }
  // รวม CORS ให้ทุก response
  for (const [k, v] of Object.entries(CORS)) if (!headers.has(k)) headers.set(k, v);
  return new Response(JSON.stringify(data), { ...base, headers });
}

export function ok(data: unknown, init?: number | ResponseInit) {
  return json(data, init ?? 200);
}

export function bad(message: string, status = 400) {
  return json({ ok: false, error: message }, status);
}

// Service-role supabase client (Edge Functions เท่านั้น)
// ใช้ env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (เผื่อชื่ออื่นด้วย)
export function sbAdmin() {
  const url =
    Deno.env.get("SUPABASE_URL") ||
    "";
  const key =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("SERVICE_ROLE_KEY") ||
    Deno.env.get("SERVICE_ROLE") ||
    "";
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or service role key in env");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const bytes = Array.from(new Uint8Array(hash));
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

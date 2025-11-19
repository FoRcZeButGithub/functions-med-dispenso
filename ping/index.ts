import { ok, CORS } from "../_shared/mod.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  // อนุญาตทุกเมธอดแบบอ่านค่า
  return ok({ ok: true, now: new Date().toISOString(), method: req.method });
});

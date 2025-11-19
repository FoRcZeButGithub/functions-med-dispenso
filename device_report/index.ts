import { sbAdmin, sha256Hex, ok, bad, CORS } from "../_shared/mod.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== "POST") return bad("POST only", 405);

  try {
    const sb = sbAdmin();

    const device_key = req.headers.get("x-device-key") || "";
    const body = await req.json().catch(() => ({}));
    const { device_id, job_id, ok: success = true, pulses = 0 } = body;

    if (!device_id || !device_key || !job_id) return bad("missing fields");

    // verify device
    const { data: dev, error: devErr } = await sb
      .from("devices").select("enabled, api_key_hash")
      .eq("id", device_id).maybeSingle();

    if (devErr) return bad(devErr.message);
    if (!dev || !dev.enabled) return bad("device disabled", 401);
    if (await sha256Hex(device_key) !== dev.api_key_hash) return bad("bad device key", 401);

    // update job status
    const status = success ? "completed" : "failed";
    const stampField = success ? "completed_at" : "failed_at";

    const { error: upErr } = await sb
      .from("jobs")
      .update({ status, [stampField]: new Date().toISOString() })
      .eq("id", job_id);

    if (upErr) return bad(upErr.message);

    await sb.from("job_events").insert({
      job_id, event: success ? "done" : "error", data: { pulses }
    });

    return ok({ ok: true });
  } catch (e: any) {
    return bad(`server error: ${e?.message ?? String(e)}`, 500);
  }
});

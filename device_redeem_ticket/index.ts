import { sbAdmin, sha256Hex, ok, bad, CORS } from "../_shared/mod.ts";

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== "POST") return bad("POST only", 405);

  try {
    const sb = sbAdmin();

    // headers + body
    const device_key = req.headers.get("x-device-key") || "";
    const body = await req.json().catch(() => ({}));
    const { device_id, ticket_id, otp } = body;

    if (!device_id || !device_key || !ticket_id || !otp) {
      return bad("missing fields");
    }

    // verify device
    const { data: dev, error: devErr } = await sb
      .from("devices").select("id, enabled, api_key_hash")
      .eq("id", device_id).maybeSingle();

    if (devErr) return bad(devErr.message);
    if (!dev || !dev.enabled) return bad("device disabled", 401);
    if (await sha256Hex(device_key) !== dev.api_key_hash) return bad("bad device key", 401);

    // load ticket
    const { data: tk, error: tkErr } = await sb
      .from("tickets")
      .select("id, job_id, device_id, otp_hash, expires_at, used")
      .eq("id", ticket_id).maybeSingle();

    if (tkErr) return bad(tkErr.message);
    if (!tk) return bad("ticket not found", 404);
    if (tk.device_id !== device_id) return bad("wrong device");
    if (tk.used) return bad("ticket used");
    if (new Date(tk.expires_at) < new Date()) return bad("ticket expired");
    if (await sha256Hex(String(otp)) !== tk.otp_hash) return bad("bad otp");

    // mark ticket used (atomic)
    const { data: usedRow, error: useErr } = await sb
      .from("tickets")
      .update({ used: true })
      .eq("id", ticket_id)
      .eq("used", false)
      .select("id")
      .maybeSingle();

    if (useErr) return bad(useErr.message);
    if (!usedRow) return bad("ticket already used");

    // authorize job
    const { data: job, error: jobErr } = await sb
      .from("jobs")
      .update({ status: "authorized", authorized_at: new Date().toISOString() })
      .eq("id", tk.job_id)
      .select("id, bin_id, units, device_id")
      .single();

    if (jobErr) return bad(jobErr.message);
    if (!job) return bad("job not found", 404);
    if (job.device_id !== device_id) return bad("job/device mismatch");

    // bin params
    const { data: bin, error: binErr } = await sb
      .from("bins")
      .select("motor_index, steps_per_unit")
      .eq("id", job.bin_id)
      .single();

    if (binErr) return bad(binErr.message);

    await sb.from("job_events").insert({ job_id: job.id, event: "authorize", data: {} });

    return ok({
      ok: true,
      job_id: job.id,
      units: job.units,
      motor_index: bin.motor_index,
      steps_per_unit: bin.steps_per_unit,
    });
  } catch (e: any) {
    return bad(`server error: ${e?.message ?? String(e)}`, 500);
  }
});

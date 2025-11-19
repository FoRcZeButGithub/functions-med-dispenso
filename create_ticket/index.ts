import { sbAdmin, sha256Hex, ok, bad, CORS } from "../_shared/mod.ts";

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== "POST") return bad("POST only", 405);

  try {
    const ADMIN_KEY = Deno.env.get("ADMIN_KEY") ?? "";
    const body = await req.json().catch(() => ({}));
    const { admin_key, device_id, bin_id, patient_id, med_id, units, ttl_seconds = 300 } = body;

    if (!admin_key || admin_key !== ADMIN_KEY) return bad("unauthorized", 401);
    if (!device_id || !bin_id || !units) return bad("missing fields");

    const sb = sbAdmin();

    // ตรวจว่า bin เป็นของ device นี้
    const { data: bin, error: binErr } = await sb
      .from("bins").select("id,device_id").eq("id", bin_id).maybeSingle();
    if (binErr) return bad(binErr.message);
    if (!bin || bin.device_id !== device_id) return bad("bin/device mismatch");

    // สร้าง OTP 6 หลัก
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otp_hash = await sha256Hex(otp);
    const expires_at = new Date(Date.now() + Number(ttl_seconds) * 1000).toISOString();

    // job
    const { data: job, error: jobErr } = await sb
      .from("jobs").insert({ device_id, bin_id, patient_id, med_id, units, status: "queued" })
      .select("id").single();
    if (jobErr) return bad(jobErr.message);

    // ticket
    const { data: tk, error: tkErr } = await sb
      .from("tickets").insert({ job_id: job.id, device_id, otp_hash, expires_at })
      .select("id").single();
    if (tkErr) return bad(tkErr.message);

    await sb.from("job_events").insert({ job_id: job.id, event: "create", data: { units } });

    return ok({ ok: true, ticket_id: tk.id, job_id: job.id, otp });
  } catch (e: any) {
    return bad(`server error: ${e?.message ?? String(e)}`, 500);
  }
});

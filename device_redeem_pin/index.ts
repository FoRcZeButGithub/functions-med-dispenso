// supabase/functions/device_redeem_pin/index.ts
import { ok, bad, CORS, sbAdmin, sha256Hex } from "../_shared/mod.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST")     return bad("POST only", 405);

  const headers = Object.fromEntries(req.headers.entries());
  const device_key = headers["x-device-key"];
  const { device_id, otp } = await req.json().catch(()=> ({}));

  if (!device_id || !otp)           return bad("missing device_id or otp");
  if (!device_key)                  return bad("missing x-device-key", 401);

  const sb = sbAdmin();

  // ตรวจสอบ device key
  const { data: dev, error: devErr } = await sb
    .from("devices").select("device_id, api_key_hash")
    .eq("device_id", device_id).maybeSingle();
  if (devErr) return bad(devErr.message);
  if (!dev)   return bad("unknown device", 401);

  const key_hash = await sha256Hex(device_key);
  if (key_hash !== dev.api_key_hash) return bad("unauthorized", 401);

  // ค้น ticket จาก otp_hash + device_id
  const otp_hash = await sha256Hex(String(otp));
  const nowIso = new Date().toISOString();
  const { data: tk, error: tkErr } = await sb
    .from("tickets")
    .select("id, job_id")
    .eq("device_id", device_id)
    .eq("otp_hash", otp_hash)
    .is("used", false)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (tkErr) return bad(tkErr.message);
  if (!tk)   return bad("invalid or expired otp", 400);

  // job + bin + patient
  const { data: job, error: jobErr } = await sb
    .from("jobs")
    .select("id, units, bin_id, patient_id")
    .eq("id", tk.job_id).maybeSingle();
  if (jobErr) return bad(jobErr.message);
  if (!job)   return bad("job not found");

  const { data: bin, error: binErr } = await sb
    .from("bins").select("motor_index, steps_per_unit").eq("id", job.bin_id).maybeSingle();
  if (binErr) return bad(binErr.message);
  if (!bin)   return bad("bin not found");

  const { data: pat } = await sb
    .from("patients").select("display_name").eq("id", job.patient_id).maybeSingle();

  // mark used + อัปเดตสถานะงาน + event
  const updates = [
    sb.from("tickets").update({ used: true, used_at: nowIso }).eq("id", tk.id),
    sb.from("jobs").update({ status: "authorized", authorized_at: nowIso }).eq("id", job.id),
    sb.from("job_events").insert({ job_id: job.id, event: "redeem", data: { device_id } }),
  ];
  const results = await Promise.all(updates);
  for (const r of results) if ((r as any).error) return bad((r as any).error.message);

  return ok({
    ok: true,
    job_id: job.id,
    units: job.units,
    motor_index: bin.motor_index,
    steps_per_unit: bin.steps_per_unit,
    patient_id: job.patient_id ?? null,
    patient_name: pat?.display_name ?? null,
  });
});

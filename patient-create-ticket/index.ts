// supabase/functions/patient-create-ticket/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";
import { CORS, json, sha256Hex } from "../_shared/mod.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_ANON_KEY") || "",
      {
        global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
        auth: { persistSession: false },
      }
    );

    const { prescription_id } = await req.json();
    if (!prescription_id) return json({ error: "prescription_id is required" }, 400);

    // 1) auth -> patient
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr) throw authErr;
    const user = authData?.user;
    if (!user) return json({ error: "User not found" }, 401);

    const { data: patient, error: patErr } = await supabase
      .from("patients")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (patErr) throw patErr;
    if (!patient?.id) return json({ error: "Patient profile not found" }, 404);

    // 2) prescription of this patient
    const { data: pres, error: presErr } = await supabase
      .from("prescriptions")
      .select("id, patient_id, med_id, device_id, bin_id, dose_units, active")
      .eq("id", prescription_id)
      .maybeSingle();
    if (presErr) throw presErr;
    if (!pres) return json({ error: "Prescription not found" }, 404);
    if (!pres.active) return json({ error: "Prescription is not active" }, 400);
    if (pres.patient_id !== patient.id) return json({ error: "Not your prescription" }, 403);

    // 3) create job
    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .insert({
        device_id: pres.device_id,
        bin_id: pres.bin_id,
        units: pres.dose_units ?? 1,
        status: "queued",
        patient_id: patient.id,
        med_id: pres.med_id,
      })
      .select("id, device_id, bin_id, units, status")
      .single();
    if (jobErr) throw jobErr;

    // 4) create ticket (2 minutes TTL)
    const otp = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
    const otp_hash = await sha256Hex(otp);
    const expires_at = new Date(Date.now() + 2 * 60 * 1000).toISOString();

    const { data: ticket, error: ticketErr } = await supabase
      .from("tickets")
      .insert({
        job_id: job.id,
        device_id: job.device_id,
        otp_hash,
        expires_at,
        used: false,
      })
      .select("id, job_id, device_id, expires_at, used, created_at")
      .single();
    if (ticketErr) throw ticketErr;

    // 5) qr_text compatible with doctor console
    const qr_text = `ticket:${ticket.id}|otp:${otp}`;

    return json({
      ok: true,
      job_id: job.id,
      ticket_id: ticket.id,
      otp,         // do not store raw otp anywhere else
      qr_text,     // preferred for QR
      payload: {   // optional: structured payload if you need it elsewhere
        ticket_id: ticket.id,
        job_id: job.id,
        device_id: job.device_id,
        bin_id: job.bin_id,
        units: job.units,
        otp,
        expires_at: ticket.expires_at,
        kind: "dispense_ticket",
        v: 1,
      },
    }, 200);
  } catch (err: any) {
    return json({ error: err?.message ?? String(err) }, 500);
  }
});
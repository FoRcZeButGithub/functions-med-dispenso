// supabase/functions/patient-report-symptoms/index.ts
import { serve } from "jsr:@std/http";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { CORS, json } from "../_shared/mod.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    const { job_id, age, symptoms, chronic_diseases, allergies } = await req.json();
    if (!job_id) throw new Error("job_id is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );
    
    // RLS จะช่วยตรวจสอบว่าผู้ใช้เป็นเจ้าของ job_id นี้จริงหรือไม่
    const { error } = await supabase.from("job_events").insert({
      job_id: job_id,
      event: "patient_report",
      data: { age, symptoms, chronic_diseases, allergies },
    });

    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json", ...CORS },
      status: 200,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { "Content-Type": "application/json", ...CORS },
      status: 500,
    });
  }
});
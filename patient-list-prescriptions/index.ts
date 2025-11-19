import { createClient } from "jsr:@supabase/supabase-js@2";
import { CORS, json } from "../_shared/mod.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    // Strict env validation
    const url = Deno.env.get("https://gzdxnkejgebiwraxoakl.supabase.co");
    const anon = Deno.env.get("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6ZHhua2VqZ2ViaXdyYXhvYWtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY3ODUxMjAsImV4cCI6MjA3MjM2MTEyMH0.cuoZf12ACP6MDAWEpl8eC6PvHmPG5vbn8abZGX7iavQ");
    if (!url) throw new Error("ENV SUPABASE_URL is missing");
    if (!anon) throw new Error("ENV SUPABASE_ANON_KEY is missing");

    const supabase = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      auth: { persistSession: false },
    });

    // Identify logged-in user
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr) throw new Error(`auth.getUser failed: ${authErr.message}`);
    const user = authData?.user;
    if (!user) return json({ error: "User not found (no session token sent?)" }, 401);

    // Map user -> patient
    const { data: patient, error: patErr } = await supabase
      .from("patients")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (patErr) throw new Error(`fetch patient failed: ${patErr.message}`);
    if (!patient?.id) return json({ error: "Patient profile not found" }, 404);

    // Prescriptions for this patient
    const { data, error } = await supabase
      .from("prescriptions")
      .select(`
        id,
        patient_id,
        med_id,
        device_id,
        bin_id,
        dose_units,
        schedule,
        active,
        created_at,
        medicines ( id, name, form, strength, unit )
      `)
      .eq("patient_id", patient.id)
      .eq("active", true)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`query prescriptions failed: ${error.message}`);
    return json(data ?? [], 200);
  } catch (err: any) {
    // Minimal logging
    console.error("patient-list-prescriptions error:", err?.message ?? String(err));
    return json({ error: err?.message ?? String(err) }, 500);
  }
});
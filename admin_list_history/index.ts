// supabase/functions/admin_list_history/index.ts
import { ok, bad, CORS, sbAdmin } from "../_shared/mod.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return bad("POST only", 405);

  const ADMIN_KEY = Deno.env.get("ADMIN_KEY") || "";
  const body = await req.json().catch(()=> ({}));
  const { admin_key, limit = 100 } = body;
  if (!admin_key || admin_key !== ADMIN_KEY) return bad("unauthorized", 401);

  const sb = sbAdmin();

  const { data, error } = await sb
    .from("v_history")
    .select("id,status,created_at,authorized_at,completed_at,failed_at,units,device_id,bin_id,motor_index,steps_per_unit,patient_name,medicine_name")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return bad(error.message);
  return ok({ ok: true, items: data ?? [] });
});
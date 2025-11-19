// supabase/functions/admin_list_medicines/index.ts
import { ok, bad, CORS, sbAdmin } from "../_shared/mod.ts";

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (req.method !== "POST") return bad("POST only", 405);

    const ADMIN_KEY = Deno.env.get("ADMIN_KEY") || "";
    const body = await req.json().catch(() => ({}));
    const admin_key = body?.admin_key;
    const limit = Number(body?.limit ?? 500);
    if (!admin_key || admin_key !== ADMIN_KEY) return bad("unauthorized", 401);

    const sb = sbAdmin();
    const { data, error } = await sb
        .from("medicines")
        .select("id,code,name,form,strength,unit,description,take_when,stock,created_at,updated_at")
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit);

    if (error) return bad(error.message);
    return ok({ ok: true, items: data ?? [] });
});

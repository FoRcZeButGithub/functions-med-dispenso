// supabase/functions/admin_delete_medicine/index.ts
import { ok, bad, CORS, sbAdmin } from "../_shared/mod.ts";

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (req.method !== "POST")     return bad("POST only", 405);

    const ADMIN_KEY = Deno.env.get("ADMIN_KEY") || "";
    const body = await req.json().catch(()=> ({}));
    const { admin_key, id } = body || {};
    if (!admin_key || admin_key !== ADMIN_KEY) return bad("unauthorized", 401);
    if (!id) return bad("missing id");
    if (typeof id !== "string" || !uuidRe.test(id)) return bad("invalid id format");

    const sb = sbAdmin();
    const { error } = await sb.from("medicines").delete().eq("id", id);
    if (error) return bad(error.message);
    return ok({ ok: true });
});

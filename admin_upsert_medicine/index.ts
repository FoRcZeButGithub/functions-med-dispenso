// supabase/functions/admin_upsert_medicine/index.ts
import { ok, bad, CORS, sbAdmin } from "../_shared/mod.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return bad("POST only", 405);

  const ADMIN_KEY = Deno.env.get("ADMIN_KEY") || "";
  const body = await req.json().catch(() => ({}));
  const admin_key = body?.admin_key;
  if (!admin_key || admin_key !== ADMIN_KEY) return bad("unauthorized", 401);

  const id: string | null = body?.id ?? null;
  const payload: any = {
    code:       body?.code ?? null,
    name:       body?.name ?? null,
    form:       body?.form ?? null,
    strength:   body?.strength ?? null,
    unit:       body?.unit ?? "unit",
    take_when:  body?.when ?? null,
    stock:      typeof body?.stock === "number" ? body.stock : null,
    description:body?.desc ?? null,
    updated_at: new Date().toISOString(),
  };
  if (!payload.name) return bad("name required");

  const sb = sbAdmin();

  if (id) {
    const { data, error } = await sb.from("medicines").update(payload).eq("id", id).select("id").maybeSingle();
    if (error) return bad(error.message);
    return ok({ ok: true, id: data?.id ?? id, action: "updated" });
  } else {
    const insert = { ...payload, created_at: new Date().toISOString() };
    const { data, error } = await sb.from("medicines").insert(insert).select("id").single();
    if (error) return bad(error.message);
    return ok({ ok: true, id: data.id, action: "created" });
  }
});

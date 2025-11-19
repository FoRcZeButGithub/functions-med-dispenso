import { sbAdmin, ok, bad, CORS } from "../_shared/mod.ts";

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (req.method !== "POST")     return bad("POST only", 405);
});

  try {
    const ADMIN_KEY = Deno.env.get("ADMIN_KEY") || "";
    const body = await req.json().catch(() => ({}));
    const { admin_key, ticket_id, job_id } = body;

    if (!admin_key || admin_key !== ADMIN_KEY) return bad("unauthorized", 401);
    if (!ticket_id && !job_id) return bad("missing ticket_id or job_id");

    const sb = sbAdmin();

    // ถ้ามี ticket_id ให้หา ticket -> job
    let t: any = null;
    if (ticket_id) {
      const { data, error } = await sb.from("tickets")
        .select("id, used, expires_at, device_id, job_id")
        .eq("id", ticket_id)
        .maybeSingle();
      if (error) return bad(error.message);
      if (!data) return bad("ticket not found", 404);
      t = data;
    }

    const jId = job_id || t.job_id;

    const { data: job, error: jErr } = await sb.from("jobs")
      .select("id, status, device_id, bin_id, units, authorized_at, completed_at, failed_at")
      .eq("id", jId)
      .maybeSingle();
    if (jErr) return bad(jErr.message);
    if (!job) return bad("job not found", 404);

    const { data: events, error: eErr } = await sb.from("job_events")
      .select("created_at, event, data")
      .eq("job_id", jId)
      .order("created_at", { ascending: true });
    if (eErr) return bad(eErr.message);

    return ok({
      ok: true,
      ticket: t ?? null,
      job,
      events: events ?? [],
      received: t ? !!t.used : (job?.status === "authorized"),
      done: job?.status === "completed",
      failed: job?.status === "failed",
    });
  } catch (e: any) {
    return bad(`server error: ${e?.message ?? String(e)}`, 500);
  }
});

// Edge Function: patient-get-ticket
// เป้าหมาย: ดึง "บัตรคิว/ตั๋วล่าสุด" ของผู้ป่วย (หรือหลายรายการถ้ากำหนด limit)
// - คงพฤติกรรมเดิม: CORS/OPTIONS, JSON ตอบกลับเรียบง่าย, ส่งต่อ Authorization เพื่อ RLS
// - ป้องกัน error จากโครงสร้างตารางต่างกัน: มี fallback ถ้า order("created_at") ใช้ไม่ได้

import { createClient } from "jsr:@supabase/supabase-js@2";
import { CORS, json } from "../_shared/mod.ts";

Deno.serve(async (req: Request): Promise<Response> => {
  // ---- Preflight CORS ----
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(req.url);
  const authHeader = req.headers.get("Authorization") ?? "";

  // ===== อ่านพารามิเตอร์แบบยืดหยุ่น =====
  // 1) patient_id: จาก query หรือ body JSON; ถ้าไม่เจอ จะลองอ่านจาก token (`auth.getUser()`)
  let patientId = url.searchParams.get("patient_id");

  const status = url.searchParams.get("status") ?? undefined;       // ถ้าต้องการกรองสถานะ (เช่น "waiting","active")
  const clinicId = url.searchParams.get("clinic_id") ?? undefined;  // ถ้าต้องการกรองคลินิก
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Math.max(1, Math.min(100, Number(limitParam))) : 1;

  if (!patientId && req.headers.get("content-type")?.includes("application/json")) {
    try {
      const body = await req.json();
      if (typeof body?.patient_id === "string") patientId = body.patient_id;
    } catch {
      // ไม่เป็น JSON ก็ข้าม
    }
  }

  // ===== สร้าง client โดยส่งต่อ Authorization เพื่อคง RLS เดิม =====
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!, // ใช้ ANON + Authorization ของผู้ใช้
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    },
  );

  // ถ้ายังไม่มี patientId ให้ลองอ่านจากตัวตนผู้ใช้
  if (!patientId) {
    const { data: userData } = await supabase.auth.getUser();
    // กรณี schema ผูกผู้ป่วย = user.id (ถ้าคุณ map อย่างอื่น ให้ส่ง patient_id มาดีกว่า)
    patientId = userData?.user?.id ?? null;
  }

  if (!patientId) {
    return json({ error: "Missing 'patient_id' (query/body) และไม่พบจาก token" }, 400);
  }

  // ===== ชื่อตารางยืดหยุ่นผ่าน ENV (ถ้าไม่ตั้ง ใช้ 'tickets') =====
  const table = Deno.env.get("TABLE_TICKETS") || "tickets";

  // ===== Query หลัก (มี fallback ถ้า column created_at ไม่มี) =====
  const buildQuery = () => {
    let q = supabase.from(table).select("*").eq("patient_id", patientId!);
    if (status) q = q.eq("status", status);
    if (clinicId) q = q.eq("clinic_id", clinicId);
    q = q.order("created_at", { ascending: false }).limit(limit);
    return q;
  };

  try {
    let { data, error } = await buildQuery();

    // Fallback: ถ้า column 'created_at' ไม่มี ให้ลองไม่สั่ง order (เพื่อไม่พัง)
    if (error && /created_at/i.test(error.message ?? "")) {
      const { data: data2, error: error2 } = await supabase
        .from(table)
        .select("*")
        .eq("patient_id", patientId!)
        .limit(limit);
      if (error2) return json({ error: error2.message }, 500);
      data = data2;
    } else if (error) {
      return json({ error: error.message }, 500);
    }

    // รูปแบบผลลัพธ์: ถ้า limit=1 ให้คืน `ticket` เดี่ยว; ถ้ามากกว่า 1 ให้คืน `tickets`
    if (limit === 1) {
      return json({ patient_id: patientId, ticket: (data && data[0]) ?? null }, 200);
    }
    return json({ patient_id: patientId, tickets: data ?? [] }, 200);
  } catch (err) {
    return json({ error: "Unexpected error", detail: String(err) }, 500);
  }
});

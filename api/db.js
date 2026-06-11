const SHEETS_WEBHOOK = "https://script.google.com/macros/s/AKfycbyPpyRvRfuvBBSvRHg3a-N5MMrsgT6Z0y8eCY-A1kFn4NHonvR3gTv6XR5RjPDKRxSSeg/exec";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: "Supabase not configured" });
  }

  const headers = {
    "Content-Type": "application/json",
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
  };

  // Save a session
  if (req.method === "POST") {
    try {
      const body = req.body;

      // 1. Save to Supabase
      const supabaseRes = await fetch(`${SUPABASE_URL}/rest/v1/sessions`, {
        method: "POST",
        headers: { ...headers, "Prefer": "return=representation" },
        body: JSON.stringify(body),
      });
      const supabaseData = await supabaseRes.json();

      // 2. Send to Google Sheets (fire and forget — don't block on failure)
      try {
        await fetch(SHEETS_WEBHOOK, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch(sheetErr) {
        console.warn("Google Sheets sync failed (non-fatal):", sheetErr.message);
      }

      return res.status(supabaseRes.ok ? 200 : 500).json(supabaseData);

    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // Load sessions for a student
  if (req.method === "GET") {
    try {
      const { student_id } = req.query;
      const filter = student_id
        ? `?student_name=eq.${encodeURIComponent(student_id)}&order=created_at.desc`
        : `?order=created_at.desc&limit=50`;
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/sessions${filter}`,
        { headers }
      );
      const data = await response.json();
      return res.status(response.ok ? 200 : 500).json(data);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}

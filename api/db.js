const SHEETS_WEBHOOK = "https://script.google.com/macros/s/AKfycbxxz5QgKMiXO0IPvhcloUhah4UjO8ry3URutsi7dN-3ShBKDwE04ExIdBXPmAw_ptAtZg/exec";

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

  if (req.method === "POST") {
    try {
      const body = req.body;

      // Handle waitlist signups separately
      if (body._waitlist) {
        try {
          await fetch(`${SUPABASE_URL}/rest/v1/waitlist`, {
            method: "POST",
            headers: { ...headers, "Prefer": "return=representation" },
            body: JSON.stringify({ email: body.email, name: body.name||null, signed_up_at: body.signed_up_at }),
          });
        } catch(e) { console.warn("Waitlist save failed:", e); }
        return res.status(200).json({ ok: true });
      }

      // Handle drill saves — go to Supabase drills table + Google Sheets
      if (body._drill) {
        try {
          await fetch(`${SUPABASE_URL}/rest/v1/drills`, {
            method: "POST",
            headers: { ...headers, "Prefer": "return=representation" },
            body: JSON.stringify(body),
          });
        } catch(e) { console.warn("Drill Supabase save failed:", e); }

        // Send to Google Sheets (Drills tab)
        try {
          await fetch(SHEETS_WEBHOOK, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
        } catch(e) { console.warn("Drill sheets sync failed:", e); }

        return res.status(200).json({ ok: true });
      }

      // Regular session save
      const supabaseRes = await fetch(`${SUPABASE_URL}/rest/v1/sessions`, {
        method: "POST",
        headers: { ...headers, "Prefer": "return=representation" },
        body: JSON.stringify(body),
      });
      const supabaseData = await supabaseRes.json();
      if (!supabaseRes.ok) {
        console.error("Supabase session save failed:", supabaseRes.status, JSON.stringify(supabaseData));
      }

      // Send to Google Sheets
      try {
        await fetch(SHEETS_WEBHOOK, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch(sheetErr) {
        console.warn("Google Sheets sync failed:", sheetErr.message);
      }

      return res.status(supabaseRes.ok ? 200 : 500).json(supabaseData);

    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

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

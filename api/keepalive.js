export default async function handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: "Supabase not configured" });
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/waitlist?select=id&limit=1`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
      },
    });
    const data = await response.json();
    return res.status(response.ok ? 200 : 500).json({ ok: response.ok, pinged: new Date().toISOString(), data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

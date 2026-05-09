// api/fetch-sg.js
// Vercel serverless function — fetches a Google Drive PDF and extracts text
// Deploy this to: counselling-roleplay.vercel.app/api/fetch-sg
//
// Usage: GET /api/fetch-sg?fileId=GOOGLE_DRIVE_FILE_ID
// Returns: { text: "extracted text content..." }
//
// Requires: pdfjs-dist (add to package.json)
// The file must be shared as "Anyone with the link can view" in Google Drive

export default async function handler(req, res) {
  // CORS headers — allow requests from any origin (the app can be on any domain)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { fileId } = req.query;
  if (!fileId) {
    return res.status(400).json({ error: 'Missing fileId parameter' });
  }

  // Whitelist of allowed file IDs — only AIPC study guides
  const ALLOWED_FILE_IDS = [
    '1xZKPkU9PAfBQjWfyePX-Ryfg5mUSU7pP', // SG1
    '1eNZfzlq-ck8nmW2MQ5HVGjOvg9di3e5c', // SG2
    '1GNJA1B9QEg72dKbZXkbGzfZT2uq03VKt', // SG3
    '12CPriGB-Ddhn_33d92BpW7SmjHlv5hm3', // SG4
    '1XfF3IFfOt07CqQKawAytTadZBCI5jjJM', // SG5
    '1pCAuFOM8pZux7RpAAeBoUmarMMs9Oz3m', // SG6
    '1CQIXhJBAvvPXudeIFDjg7WhsQ-tGyuDp', // SG7
    '1x0dx0aGfj3vMOeZFviwUNg23Qo-Ufdi-', // SG8
    '1hmisbuVvhLFiZKqRH4kSBeRyv6eRfElq', // SG9
    '1mhjypvN6UjqhoCm-G8WxHg3wFFCFaLBk', // SG10
    '1IF-arCAtyLdwpTozW8k4cbci2CudDkIU', // SG11
    '19c6k5LEr_UqYMWaq2jsT-DDR0YJHIlLZ', // SG12
    '1nL2Znv_a7WEkCsau5VE7tPLHq6-lnXxT', // SG13
    '1efkW9XqDvA_L4tBaHR7uRN0BSpqiod-q', // SG14
    '1f4UDqiFvJlzZB3ie7vX-g4LoO-ieuPJN', // SG15
    '1POoy732n3077I2YJipvQHbOC9etcwob3', // SG16
    '1VhPA0G0WXSG5BobFHXQzNt15F-c5ndQn', // SG17
  ];

  if (!ALLOWED_FILE_IDS.includes(fileId)) {
    return res.status(403).json({ error: 'File not permitted' });
  }

  try {
    // Fetch the PDF from Google Drive public download URL
    const driveUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    const pdfResponse = await fetch(driveUrl, {
      headers: { 'User-Agent': 'CounsellorReady/1.0' },
      redirect: 'follow',
    });

    if (!pdfResponse.ok) {
      throw new Error(`Drive fetch failed: ${pdfResponse.status}`);
    }

    const pdfBuffer = await pdfResponse.arrayBuffer();

    // Extract text using pdf-parse (lighter than pdfjs for serverless)
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
    const data = await pdfParse(Buffer.from(pdfBuffer), {
      max: 0, // parse all pages
    });

    // Return the extracted text
    // Limit to 15000 chars to keep response size manageable
    const text = data.text.slice(0, 15000);

    // Cache for 24 hours — study guides don't change often
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
    return res.status(200).json({ text, pages: data.numpages });

  } catch (error) {
    console.error('fetch-sg error:', error);
    return res.status(500).json({ error: 'Failed to fetch study guide', detail: error.message });
  }
}

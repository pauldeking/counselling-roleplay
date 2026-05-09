// api/fetch-sg.js
// Fetches AIPC study guide PDFs from Google Drive using the Drive API
// Requires: GOOGLE_API_KEY environment variable in Vercel
// Requires: pdf-parse in package.json

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { fileId } = req.query;
  if (!fileId) return res.status(400).json({ error: 'Missing fileId' });

  // Whitelist — only these 17 AIPC study guide file IDs are allowed
  const ALLOWED = [
    '1xZKPkU9PAfBQjWfyePX-Ryfg5mUSU7pP', // SG1  CHCCSL001
    '1eNZfzlq-ck8nmW2MQ5HVGjOvg9di3e5c', // SG2  CHCCSL002
    '1GNJA1B9QEg72dKbZXkbGzfZT2uq03VKt', // SG3  CHCCSL007
    '12CPriGB-Ddhn_33d92BpW7SmjHlv5hm3', // SG4  CHCCSL004
    '1XfF3IFfOt07CqQKawAytTadZBCI5jjJM', // SG5  CHCCSL005
    '1pCAuFOM8pZux7RpAAeBoUmarMMs9Oz3m', // SG6  CHCCSL006 Intro
    '1CQIXhJBAvvPXudeIFDjg7WhsQ-tGyuDp', // SG7  CHCCSL006 CBT
    '1x0dx0aGfj3vMOeZFviwUNg23Qo-Ufdi-', // SG8  CHCCSL006 SFT
    '1hmisbuVvhLFiZKqRH4kSBeRyv6eRfElq', // SG9  CHCCSL006 ACT
    '1mhjypvN6UjqhoCm-G8WxHg3wFFCFaLBk', // SG10 CHCCSL003
    '1IF-arCAtyLdwpTozW8k4cbci2CudDkIU', // SG11 CHCCCS014
    '19c6k5LEr_UqYMWaq2jsT-DDR0YJHIlLZ', // SG12 CHCCCS017
    '1nL2Znv_a7WEkCsau5VE7tPLHq6-lnXxT', // SG13 CHCCSM005
    '1efkW9XqDvA_L4tBaHR7uRN0BSpqiod-q', // SG14 CHCMHS001
    '1f4UDqiFvJlzZB3ie7vX-g4LoO-ieuPJN', // SG15 CHCLEG001
    '1POoy732n3077I2YJipvQHbOC9etcwob3', // SG16 CHCCCS019
    '1VhPA0G0WXSG5BobFHXQzNt15F-c5ndQn', // SG17 CHCDIV001+002
  ];

  if (!ALLOWED.includes(fileId)) {
    return res.status(403).json({ error: 'File not permitted' });
  }

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GOOGLE_API_KEY not configured' });
  }

  try {
    // Google Drive API v3 — download file content directly
    // ?alt=media tells the API to return the file bytes, not metadata
    const driveUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`;

    const pdfRes = await fetch(driveUrl, {
      headers: { 'Accept': 'application/pdf' },
    });

    if (!pdfRes.ok) {
      const errText = await pdfRes.text();
      throw new Error(`Drive API error ${pdfRes.status}: ${errText.slice(0, 200)}`);
    }

    const buffer = await pdfRes.arrayBuffer();

    // Extract all text from PDF
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
    const data = await pdfParse(Buffer.from(buffer), { max: 0 });

    // Clean and return the text
    const cleaned = cleanPdfText(data.text);

    // Cache for 24 hours — PDFs are static
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');
    return res.status(200).json({
      text: cleaned,
      pages: data.numpages,
      chars: cleaned.length,
    });

  } catch (err) {
    console.error('fetch-sg error:', err.message);
    return res.status(500).json({
      error: 'Failed to fetch study guide',
      detail: err.message,
    });
  }
}

function cleanPdfText(raw) {
  return raw
    .replace(/\r\n/g, '\n')
    // Collapse 3+ newlines to 2
    .replace(/\n{3,}/g, '\n\n')
    // Collapse multiple spaces/tabs
    .replace(/[ \t]{2,}/g, ' ')
    // Remove dotted TOC lines e.g. "Introduction ........ 9"
    .replace(/[^\n]*\.{4,}\s*\d+\n/g, '')
    // Remove standalone page numbers on their own line
    .replace(/^\s*\d{1,3}\s*$/gm, '')
    // Remove copyright boilerplate
    .replace(/This book is protected by copyright[\s\S]{0,500}of the copyright\./g, '')
    .replace(/Published by: Australian Institute of Professional Counsellors[\s\S]{0,300}ACN 077 738 035/g, '')
    .replace(/All Case Histories in this text[\s\S]{0,300}purely coincidental\./g, '')
    .replace(/Australian Institute of Professional Counsellors\s*\nHead Office[\s\S]{0,150}QLD 4006\./g, '')
    .replace(/Copyright ownership[\s\S]{0,200}All rights reserved[^\n]*/g, '')
    // Remove repeated section header that appears incorrectly throughout SG3
    .replace(/Section \d+: Key Considerations in Establishing Respectful Relationships\n/g, '')
    // Final whitespace cleanup
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    // 15000 chars = approx 25-30 pages of content — rich context for Claude
    .slice(0, 15000);
}

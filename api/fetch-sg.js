// api/fetch-sg.js
// Fetches an AIPC study guide PDF from Google Drive and returns clean text
// Handles Google's virus-scan redirect for larger files

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { fileId } = req.query;
  if (!fileId) return res.status(400).json({ error: 'Missing fileId' });

  const ALLOWED = [
    '1xZKPkU9PAfBQjWfyePX-Ryfg5mUSU7pP',
    '1eNZfzlq-ck8nmW2MQ5HVGjOvg9di3e5c',
    '1GNJA1B9QEg72dKbZXkbGzfZT2uq03VKt',
    '12CPriGB-Ddhn_33d92BpW7SmjHlv5hm3',
    '1XfF3IFfOt07CqQKawAytTadZBCI5jjJM',
    '1pCAuFOM8pZux7RpAAeBoUmarMMs9Oz3m',
    '1CQIXhJBAvvPXudeIFDjg7WhsQ-tGyuDp',
    '1x0dx0aGfj3vMOeZFviwUNg23Qo-Ufdi-',
    '1hmisbuVvhLFiZKqRH4kSBeRyv6eRfElq',
    '1mhjypvN6UjqhoCm-G8WxHg3wFFCFaLBk',
    '1IF-arCAtyLdwpTozW8k4cbci2CudDkIU',
    '19c6k5LEr_UqYMWaq2jsT-DDR0YJHIlLZ',
    '1nL2Znv_a7WEkCsau5VE7tPLHq6-lnXxT',
    '1efkW9XqDvA_L4tBaHR7uRN0BSpqiod-q',
    '1f4UDqiFvJlzZB3ie7vX-g4LoO-ieuPJN',
    '1POoy732n3077I2YJipvQHbOC9etcwob3',
    '1VhPA0G0WXSG5BobFHXQzNt15F-c5ndQn',
  ];

  if (!ALLOWED.includes(fileId)) {
    return res.status(403).json({ error: 'File not permitted' });
  }

  try {
    const pdfBuffer = await fetchGoogleDrivePDF(fileId);
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
    const data = await pdfParse(pdfBuffer, { max: 0 });
    const cleaned = cleanPdfText(data.text);

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');
    return res.status(200).json({
      text: cleaned,
      pages: data.numpages,
      chars: cleaned.length
    });

  } catch (err) {
    console.error('fetch-sg error:', err);
    return res.status(500).json({ error: 'Failed to fetch study guide', detail: err.message });
  }
}

async function fetchGoogleDrivePDF(fileId) {
  // Step 1: Hit the standard download URL
  const url = `https://drive.google.com/uc?export=download&id=${fileId}`;
  const res1 = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    redirect: 'follow',
  });

  const contentType = res1.headers.get('content-type') || '';

  // Step 2: If we got a PDF directly, return it
  if (contentType.includes('pdf') || contentType.includes('octet-stream')) {
    const buf = await res1.arrayBuffer();
    return Buffer.from(buf);
  }

  // Step 3: Google returned an HTML virus-scan warning page
  // Extract the confirm token and retry with it
  const html = await res1.text();

  // Look for the confirm token in the warning page
  // Google uses: confirm=t& or confirm=XXXX&
  const confirmMatch = html.match(/confirm=([^&"]+)/);
  if (!confirmMatch) {
    // Try the newer Google Drive download format
    const url2 = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0&confirm=t`;
    const res2 = await fetch(url2, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      redirect: 'follow',
    });
    const buf = await res2.arrayBuffer();
    return Buffer.from(buf);
  }

  const confirm = confirmMatch[1];

  // Also extract any uuid cookie Google sets
  const uuidMatch = html.match(/uuid=([^&"]+)/);
  const uuid = uuidMatch ? uuidMatch[1] : '';

  const cookieHeader = res1.headers.get('set-cookie') || '';

  // Retry with the confirm token
  const confirmUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=${confirm}${uuid ? `&uuid=${uuid}` : ''}`;
  const res3 = await fetch(confirmUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Cookie': cookieHeader,
    },
    redirect: 'follow',
  });

  const buf = await res3.arrayBuffer();
  return Buffer.from(buf);
}

function cleanPdfText(raw) {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    // Remove dotted TOC lines
    .replace(/\.{4,}\s*\d+/g, '')
    // Remove standalone page numbers
    .replace(/^\s*\d{1,3}\s*$/gm, '')
    // Remove copyright boilerplate
    .replace(/This book is protected by copyright[\s\S]{0,400}of the copyright\./g, '')
    .replace(/Published by: Australian Institute[\s\S]{0,300}ACN 077 738 035/g, '')
    .replace(/All Case Histories[\s\S]{0,200}purely coincidental\./g, '')
    .replace(/Australian Institute of Professional Counsellors\nHead Office[\s\S]{0,100}QLD 4006\./g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    // 15000 chars gives Claude rich content — roughly 25-30 pages of text
    .slice(0, 15000);
}

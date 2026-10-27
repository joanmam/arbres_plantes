import crypto from 'crypto';

// Comprova la contrasenya enviada a la capçalera x-app-key contra APP_PASSWORD (variable d'entorn de Vercel)
function autoritzat(req) {
  const expected = process.env.APP_PASSWORD || '';
  const got = String(req.headers['x-app-key'] || '');
  if (!expected || !got) return false;
  const a = Buffer.from(got), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Puja la foto a Notion (File Upload API) i retorna l'id de la pujada.
// L'id s'ha d'adjuntar a una pàgina abans d'1 hora (ho fan save.js i pendents.js).
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-app-key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!autoritzat(req)) return res.status(401).json({ error: 'No autoritzat' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const notionToken = process.env.NOTION_TOKEN;
  if (!notionToken) return res.status(500).json({ error: 'Token Notion no configurat' });

  const { imageData } = req.body || {};
  if (!imageData) return res.status(400).json({ error: 'Falta imageData' });

  const NOTION_VERSION = '2026-03-11';
  const filename = `planta-${Date.now()}.jpg`;
  try {
    // 1. Crea l'objecte de pujada
    const c = await fetch('https://api.notion.com/v1/file_uploads', {
      method: 'POST',
      headers: { Authorization: `Bearer ${notionToken}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, content_type: 'image/jpeg' }),
    });
    const created = await c.json();
    if (!c.ok) return res.status(c.status).json({ error: created.message || 'Error creant la pujada a Notion' });

    // 2. Envia el contingut
    const form = new FormData();
    form.append('file', new Blob([Buffer.from(imageData, 'base64')], { type: 'image/jpeg' }), filename);
    const s = await fetch(`https://api.notion.com/v1/file_uploads/${created.id}/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${notionToken}`, 'Notion-Version': NOTION_VERSION },
      body: form,
    });
    const sent = await s.json();
    if (!s.ok || sent.status !== 'uploaded') return res.status(s.ok ? 500 : s.status).json({ error: sent.message || 'Error enviant la foto a Notion' });

    return res.status(200).json({ upload_id: created.id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

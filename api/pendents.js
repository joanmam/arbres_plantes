import crypto from 'crypto';

// Comprova la contrasenya enviada a la capçalera x-app-key contra APP_PASSWORD (variable d'entorn de Vercel)
function autoritzat(req) {
  const expected = process.env.APP_PASSWORD || '';
  const got = String(req.headers['x-app-key'] || '');
  if (!expected || !got) return false;
  const a = Buffer.from(got), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// URL de la foto: externa (imgbb, fotos antigues) o fitxer de Notion (caduca en 1 h, es renova a cada lectura)
function fotoDe(prop) {
  const f = prop?.files?.[0];
  return f?.external?.url || f?.file?.url || prop?.url || '';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-app-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!autoritzat(req)) return res.status(401).json({ error: 'No autoritzat' });

  const notionToken = process.env.NOTION_TOKEN;
  if (!notionToken) return res.status(500).json({ error: 'Token Notion no configurat' });
  const NOTION_DB = '82a45a640f0641d1a4cfeb95c47c8d12';
  const headers = {
    Authorization: `Bearer ${notionToken}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };

  try {
    // ── GET: llistar pendents ────────────────────────────────────────────────
    // ── GET ?imatge=<pageId>: retorna la foto del pendent (evita problemes de CORS) ──
    if (req.method === 'GET' && req.query?.imatge) {
      const pr = await fetch(`https://api.notion.com/v1/pages/${req.query.imatge}`, { headers });
      const page = await pr.json();
      if (!pr.ok) return res.status(pr.status).json(page);
      const url = fotoDe(page.properties?.['Foto URL']);
      if (!url) return res.status(404).json({ error: 'Sense foto' });
      const ir = await fetch(url);
      if (!ir.ok) return res.status(502).json({ error: `No s'ha pogut baixar la foto (${ir.status})` });
      res.setHeader('Content-Type', ir.headers.get('content-type') || 'image/jpeg');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).send(Buffer.from(await ir.arrayBuffer()));
    }

    if (req.method === 'GET') {
      const r = await fetch(`https://api.notion.com/v1/databases/${NOTION_DB}/query`, {
        method: 'POST', headers,
        body: JSON.stringify({
          filter: { property: 'Estat', select: { equals: 'Pendent' } },
          sorts: [{ timestamp: 'created_time', direction: 'descending' }],
        }),
      });
      const d = await r.json();
      if (!r.ok) return res.status(r.status).json(d);
      const pendents = d.results.map(page => ({
        id:       page.id,
        foto_url: fotoDe(page.properties['Foto URL']),
        ubicacio: page.properties['Ubicació']?.rich_text?.[0]?.plain_text || '',
        lat:      page.properties['Latitud']?.number ?? null,
        lon:      page.properties['Longitud']?.number ?? null,
        lloc:     page.properties['Lloc']?.select?.name || '',
        data:     page.properties['Data']?.date?.start || '',
      }));
      return res.status(200).json({ pendents });
    }

    // ── POST: guardar nou pendent ────────────────────────────────────────────
    if (req.method === 'POST') {
      const p = req.body || {};
      const properties = {
        Nom:   { title: [{ text: { content: "Pendent d'identificar" } }] },
        Data:  { date: { start: p.data || new Date().toISOString().split('T')[0] } },
        Estat: { select: { name: 'Pendent' } },
      };
      if (p.ubicacio) properties['Ubicació'] = { rich_text: [{ text: { content: String(p.ubicacio) } }] };
      if (p.lat != null) properties['Latitud'] = { number: Number(p.lat) };
      if (p.lon != null) properties['Longitud'] = { number: Number(p.lon) };
      if (p.lloc) properties['Lloc'] = { select: { name: String(p.lloc) } };
      if (p.foto_upload_id) {
        properties['Foto URL'] = { files: [{ type: 'file_upload', file_upload: { id: String(p.foto_upload_id) }, name: 'foto.jpg' }] };
      } else if (String(p.foto_url || '').trim().startsWith('http')) {
        properties['Foto URL'] = { files: [{ name: 'foto', type: 'external', external: { url: String(p.foto_url).trim() } }] };
      }
      const r = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST', headers,
        body: JSON.stringify({ parent: { database_id: NOTION_DB }, properties }),
      });
      const d = await r.json();
      if (!r.ok) return res.status(r.status).json(d);
      return res.status(200).json({ ok: true, id: d.id });
    }

    // ── PATCH: actualitzar pendent ───────────────────────────────────────────
    if (req.method === 'PATCH') {
      const { pageId, action, ...planta } = req.body || {};
      if (!pageId) return res.status(400).json({ error: 'Falta pageId' });

      // Arxivar (eliminar)
      if (action === 'arxivar') {
        const r = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
          method: 'PATCH', headers,
          body: JSON.stringify({ archived: true }),
        });
        const d = await r.json();
        if (!r.ok) return res.status(r.status).json(d);
        return res.status(200).json({ ok: true });
      }

      // Actualitzar amb la identificació
      const properties = {
        Nom:             { title:     [{ text: { content: String(planta.nom          || 'Desconeguda') } }] },
        'Nom científic': { rich_text: [{ text: { content: String(planta.nom_cientific || '') } }] },
        'Família':       { rich_text: [{ text: { content: String(planta.familia      || '') } }] },
        'Nom castellà':  { rich_text: [{ text: { content: String(planta.nom_castella || '') } }] },
        'Descripció':    { rich_text: [{ text: { content: String(planta.descripcio   || '') } }] },
        'Hàbitat':       { rich_text: [{ text: { content: String(planta.habitat      || '') } }] },
        Curiositats:     { rich_text: [{ text: { content: String(planta.curiositats  || '') } }] },
        'Confiança':     { select:    { name: planta.confianca || 'Baixa' } },
        Estat:           { select:    { name: 'Identificada' } },
      };
      // Només canvia la foto si se n'ha pujat una de nova (la del pendent ja hi és)
      if (planta.foto_upload_id) {
        properties['Foto URL'] = { files: [{ type: 'file_upload', file_upload: { id: String(planta.foto_upload_id) }, name: 'foto.jpg' }] };
      }
      const r = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ properties }),
      });
      const d = await r.json();
      if (!r.ok) return res.status(r.status).json(d);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

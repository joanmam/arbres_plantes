export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const notionToken = process.env.NOTION_TOKEN;
  if (!notionToken) return res.status(500).json({ error: 'Token de Notion no configurat al servidor' });

  const NOTION_DB = '82a45a640f0641d1a4cfeb95c47c8d12';

  try {
    // ── GET: carregar plantes ────────────────────────────────────────────────
    if (req.method === 'GET') {
      const r = await fetch(`https://api.notion.com/v1/databases/${NOTION_DB}/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${notionToken}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_size: 100, sorts: [{ timestamp: 'created_time', direction: 'descending' }] }),
      });
      const d = await r.json();
      if (!r.ok) return res.status(r.status).json(d);
      const raw = d.results.map(page => {
        const p = page.properties;
        return {
          nom:          p['Nom']?.title?.[0]?.plain_text || 'Desconeguda',
          nom_cientific: p['Nom científic']?.rich_text?.[0]?.plain_text || '',
          nom_castella:  p['Nom castellà']?.rich_text?.[0]?.plain_text || '',
          confianca:     p['Confiança']?.select?.name || '',
          notion_url:    page.url || '',
          ubicacio:      p['Ubicació']?.rich_text?.[0]?.plain_text || '',
          data:          p['Data']?.date?.start || page.created_time?.split('T')[0] || '',
          foto_url:      p['Foto URL']?.files?.[0]?.external?.url || p['Foto URL']?.url || '',
          lloc:          p['Lloc']?.select?.name || '',
        };
      });

      // Agrupa per lloc + nom científic (o nom si no en té)
      const grouped = {};
      for (const p of raw) {
        const key = (p.lloc || '') + '|' + (p.nom_cientific || p.nom);
        if (!grouped[key]) {
          grouped[key] = { ...p, localitzacions: [] };
        }
        if (p.ubicacio || p.data) {
          grouped[key].localitzacions.push({ ubicacio: p.ubicacio, data: p.data });
        }
        // Prioritza la foto si no en té
        if (!grouped[key].foto_url && p.foto_url) grouped[key].foto_url = p.foto_url;
      }
      const plants = Object.values(grouped);
      return res.status(200).json({ plants });
    }

    // ── POST: guardar planta ─────────────────────────────────────────────────
    if (req.method === 'POST') {
      const planta = req.body || {};
      const properties = {
        Nom:             { title:     [{ text: { content: String(planta.nom          || 'Desconeguda') } }] },
        'Nom científic': { rich_text: [{ text: { content: String(planta.nom_cientific || '') } }] },
        'Família':       { rich_text: [{ text: { content: String(planta.familia      || '') } }] },
        'Descripció':    { rich_text: [{ text: { content: String(planta.descripcio   || '') } }] },
        'Hàbitat':       { rich_text: [{ text: { content: String(planta.habitat      || '') } }] },
        Curiositats:     { rich_text: [{ text: { content: String(planta.curiositats  || '') } }] },
        'Confiança':     { select:    { name: planta.confianca || 'Baixa' } },
        Data:            { date:      { start: planta.data || new Date().toISOString().split('T')[0] } },
      };
      if (planta.ubicacio) properties['Ubicació'] = { rich_text: [{ text: { content: String(planta.ubicacio) } }] };
      if (planta.latitud  != null) properties['Latitud']  = { number: Number(planta.latitud) };
      if (planta.longitud != null) properties['Longitud'] = { number: Number(planta.longitud) };
      if (planta.foto_url) properties['Foto URL'] = { url: String(planta.foto_url) };

      const r = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: { Authorization: `Bearer ${notionToken}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent: { database_id: NOTION_DB }, properties }),
      });
      const d = await r.json();
      if (!r.ok) return res.status(r.status).json(d);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: `Method not allowed: ${req.method}` });

  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack?.split('\n')[0] });
  }
}

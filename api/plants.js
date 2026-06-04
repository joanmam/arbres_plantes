export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const notionToken = req.headers.authorization?.replace('Bearer ', '');
  if (!notionToken) return res.status(401).json({ error: 'Falta el token de Notion' });

  const NOTION_DB = '82a45a640f0641d1a4cfeb95c47c8d12';

  // ── GET: carregar plantes ──────────────────────────────────────────────────
  if (req.method === 'GET') {
    const response = await fetch(`https://api.notion.com/v1/databases/${NOTION_DB}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${notionToken}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        page_size: 100,
        sorts: [{ timestamp: 'created_time', direction: 'descending' }],
      }),
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);

    const plants = data.results.map(page => {
      const p = page.properties;
      return {
        nom:          p['Nom']?.title?.[0]?.plain_text || 'Desconeguda',
        nom_cientific: p['Nom científic']?.rich_text?.[0]?.plain_text || '',
        ubicacio:     p['Ubicació']?.rich_text?.[0]?.plain_text || '',
        data:         p['Data']?.date?.start || page.created_time?.split('T')[0] || '',
        foto_url:     p['Foto URL']?.url || '',
      };
    });
    return res.status(200).json({ plants });
  }

  // ── POST: guardar planta ───────────────────────────────────────────────────
  if (req.method === 'POST') {
    const planta = req.body;
    if (!planta) return res.status(400).json({ error: 'Falta la planta' });

    const properties = {
      Nom:             { title:     [{ text: { content: planta.nom          || 'Desconeguda' } }] },
      'Nom científic': { rich_text: [{ text: { content: planta.nom_cientific || '' } }] },
      'Família':       { rich_text: [{ text: { content: planta.familia      || '' } }] },
      'Descripció':    { rich_text: [{ text: { content: planta.descripcio   || '' } }] },
      'Hàbitat':       { rich_text: [{ text: { content: planta.habitat      || '' } }] },
      Curiositats:     { rich_text: [{ text: { content: planta.curiositats  || '' } }] },
      'Confiança':     { select:    { name: planta.confianca || 'Baixa' } },
      Data:            { date:      { start: planta.data || new Date().toISOString().split('T')[0] } },
    };
    if (planta.ubicacio) properties['Ubicació'] = { rich_text: [{ text: { content: planta.ubicacio } }] };
    if (planta.latitud  != null) properties['Latitud']  = { number: planta.latitud };
    if (planta.longitud != null) properties['Longitud'] = { number: planta.longitud };
    if (planta.foto_url) properties['Foto URL'] = { url: planta.foto_url };

    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${notionToken}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ parent: { database_id: NOTION_DB }, properties }),
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    return res.status(200).json({ ok: true, url: data.url });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

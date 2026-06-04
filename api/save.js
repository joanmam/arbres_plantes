export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const notionToken = req.headers.authorization?.replace('Bearer ', '');
  if (!notionToken) return res.status(401).json({ error: 'Falta el token de Notion' });

  const NOTION_DB = '82a45a640f0641d1a4cfeb95c47c8d12';

  try {
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
    const fotoUrl = String(planta.foto_url || '').trim();
    if (fotoUrl.startsWith('http')) properties['Foto URL'] = { url: fotoUrl };

    const r = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${notionToken}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ parent: { database_id: NOTION_DB }, properties }),
    });
    const d = await r.json();
    if (!r.ok) return res.status(r.status).json(d);
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

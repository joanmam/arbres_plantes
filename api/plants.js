export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const notionToken = req.headers.authorization?.replace('Bearer ', '');
  if (!notionToken) return res.status(401).json({ error: 'Falta el token de Notion' });

  const NOTION_DB = '82a45a640f0641d1a4cfeb95c47c8d12';

  try {
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
        nom:         p['Nom']?.title?.[0]?.plain_text || 'Desconeguda',
        nom_cientific: p['Nom científic']?.rich_text?.[0]?.plain_text || '',
        ubicacio:    p['Ubicació']?.rich_text?.[0]?.plain_text || '',
        data:        p['Data']?.date?.start || page.created_time?.split('T')[0] || '',
        foto_url:    p['Foto URL']?.url || '',
      };
    });

    res.status(200).json({ plants });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

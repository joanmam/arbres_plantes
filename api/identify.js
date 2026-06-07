export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: `Method not allowed (rebut: ${req.method})` });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key no configurada al servidor' });

  const { imageData, mediaType } = req.body || {};
  if (!imageData) return res.status(400).json({ error: 'Falta imageData' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [{
            type: 'image',
            source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageData },
          }, {
            type: 'text',
            text: `Identifica aquesta planta o arbre. Respon ÚNICAMENT amb un JSON vàlid amb aquest format exacte:
{
  "nom": "Nom comú en català",
  "nom_cientific": "Nom científic",
  "nom_castella": "Nom en castellà",
  "familia": "Família botànica",
  "confianca": "Alta|Mitjana|Baixa",
  "descripcio": "Descripció breu (2-3 frases)",
  "habitat": "Hàbitat típic",
  "curiositats": "Una curiositat interessant"
}
Si no és una planta o no es pot identificar, retorna: {"error": "No s'ha pogut identificar"}`,
          }],
        }],
      }),
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'Error Anthropic' });

    const text = data.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(200).json({ error: 'Resposta invàlida' });

    const result = JSON.parse(jsonMatch[0]);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

const functions = require('firebase-functions');
const express = require('express');
const cors = require('cors');
const multer = require('multer');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors({ origin: true }));
app.use(express.json());

const NOTION_DATABASE_ID = '82a45a640f0641d1a4cfeb95c47c8d12';

// ── Identificar planta ─────────────────────────────────────────────────────
app.post('/identify', upload.single('photo'), async (req, res) => {
  try {
    const { anthropicKey } = req.body;
    if (!anthropicKey) return res.status(400).json({ error: 'Falta la clau API de Claude' });
    if (!req.file)     return res.status(400).json({ error: 'Falta la foto' });

    const base64Image = req.file.buffer.toString('base64');
    const mediaType   = req.file.mimetype || 'image/jpeg';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64Image },
            },
            {
              type: 'text',
              text: `Identifica la planta o arbre d'aquesta foto. Respon ÚNICAMENT en format JSON vàlid (sense cap text addicional, sense markdown, sense blocs de codi), seguint exactament aquest esquema:
{
  "nom": "nom comú en català",
  "nom_cientific": "Nom científic",
  "familia": "família botànica",
  "descripcio": "descripció breu (2-3 frases)",
  "habitat": "on sol créixer",
  "curiositats": "una curiositat interessant",
  "confianca": "Alta | Mitjana | Baixa"
}
Si no pots identificar la planta, retorna confianca "Baixa" i nom "Desconeguda".`,
            },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: `Error Claude API: ${err}` });
    }

    const data = await response.json();
    const text = data.content[0].text.trim();

    let result;
    try {
      result = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) result = JSON.parse(match[0]);
      else return res.status(500).json({ error: 'Resposta de Claude no vàlida', raw: text });
    }

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── Guardar a Notion ───────────────────────────────────────────────────────
app.post('/save', async (req, res) => {
  try {
    const { notionToken, planta } = req.body;
    if (!notionToken) return res.status(400).json({ error: 'Falta el token de Notion' });
    if (!planta)      return res.status(400).json({ error: 'Falta la informació de la planta' });

    const properties = {
      Nom:            { title:     [{ text: { content: planta.nom          || 'Desconeguda' } }] },
      'Nom científic':{ rich_text: [{ text: { content: planta.nom_cientific || '' } }] },
      'Família':      { rich_text: [{ text: { content: planta.familia      || '' } }] },
      'Descripció':   { rich_text: [{ text: { content: planta.descripcio   || '' } }] },
      'Hàbitat':      { rich_text: [{ text: { content: planta.habitat      || '' } }] },
      Curiositats:    { rich_text: [{ text: { content: planta.curiositats  || '' } }] },
      'Confiança':    { select:    { name: planta.confianca || 'Baixa' } },
    };

    if (planta.data)     properties['Data']      = { date: { start: planta.data } };
    if (planta.ubicacio) properties['Ubicació']  = { rich_text: [{ text: { content: planta.ubicacio } }] };
    if (planta.latitud  != null) properties['Latitud']  = { number: planta.latitud };
    if (planta.longitud != null) properties['Longitud'] = { number: planta.longitud };
    if (planta.foto_url) properties['Foto URL']  = { url: planta.foto_url };

    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${notionToken}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        parent: { database_id: NOTION_DATABASE_ID },
        properties,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: `Error Notion API: ${err}` });
    }

    const page = await response.json();
    res.json({ ok: true, url: page.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

exports.api = functions.https.onRequest(app);

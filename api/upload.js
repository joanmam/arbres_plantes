export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const imgbbKey = process.env.IMGBB_API_KEY;
  if (!imgbbKey) return res.status(200).json({ url: '' }); // Silenciós si no hi ha clau

  const { imageData } = req.body || {};
  if (!imageData) return res.status(400).json({ error: 'Falta imageData' });

  try {
    const formData = new URLSearchParams();
    formData.append('key', imgbbKey);
    formData.append('image', imageData);

    const response = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      body: formData,
    });
    const data = await response.json();
    if (data.success) return res.status(200).json({ url: data.data.url });
    return res.status(200).json({ url: '', error: data.error?.message });
  } catch (err) {
    return res.status(200).json({ url: '', error: err.message });
  }
}

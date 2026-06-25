const DEFAULT_MODEL = 'gpt-4o-mini';

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Metodo no permitido.' });

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ ok: false, error: 'Falta OPENAI_API_KEY en Vercel.' });

    const { text, direction } = req.body || {};
    if (!text || typeof text !== 'string') return res.status(400).json({ ok: false, error: 'Texto requerido.' });

    const sourceLanguage = direction === 'pt-es' ? 'portugues brasileno' : 'espanol';
    const targetLanguage = direction === 'pt-es' ? 'espanol colombiano natural' : 'portugues brasileno natural';

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_TRANSLATION_MODEL || DEFAULT_MODEL,
        input: [
          {
            role: 'system',
            content: 'Eres un traductor profesional para atencion al cliente. Devuelve solo la traduccion, sin explicaciones, sin comillas y sin notas.'
          },
          {
            role: 'user',
            content: `Traduce de ${sourceLanguage} a ${targetLanguage}:\n\n${text}`
          }
        ],
        temperature: 0.2,
        max_output_tokens: 1200
      })
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return res.status(response.status).json({ ok: false, error: data?.error?.message || 'Error del proveedor de IA.' });
    }

    const translatedText = extractOutputText(data);
    return res.status(200).json({ ok: true, translatedText });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error interno.' });
  }
};

function extractOutputText(data) {
  if (data?.output_text) return clean(data.output_text);
  const content = data?.output?.flatMap((item) => item.content || []) || [];
  const text = content.map((part) => part.text || '').join('\n').trim();
  return clean(text);
}

function clean(value) {
  return String(value || '').replace(/^```[a-z]*\s*/i, '').replace(/```$/i, '').replace(/^['"“”]+|['"“”]+$/g, '').trim();
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

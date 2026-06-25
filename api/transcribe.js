module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Metodo no permitido.' });

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ ok: false, error: 'Falta OPENAI_API_KEY en Vercel.' });

    const { audioBase64, fileName, mimeType } = req.body || {};
    if (!audioBase64) return res.status(400).json({ ok: false, error: 'Audio requerido.' });

    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const maxBytes = 24 * 1024 * 1024;
    if (audioBuffer.byteLength > maxBytes) {
      return res.status(413).json({ ok: false, error: 'El audio supera 24 MB. Usa un audio mas corto.' });
    }

    const cleanMimeType = normalizeMimeType(mimeType || 'application/octet-stream');
    const normalizedName = normalizeAudioFileName(fileName || 'audio.webm', cleanMimeType);
    const audioBlob = new Blob([audioBuffer], { type: cleanMimeType });
    const formData = new FormData();
    formData.append('file', audioBlob, normalizedName);
    formData.append('model', process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe');
    formData.append('language', 'pt');
    formData.append('prompt', 'Audio de un cliente en portugues brasileno dentro de un chat de atencion al cliente.');
    formData.append('response_format', 'json');

    const transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData
    });

    const transcriptionData = await transcriptionResponse.json().catch(() => null);
    if (!transcriptionResponse.ok) {
      return res.status(transcriptionResponse.status).json({ ok: false, error: transcriptionData?.error?.message || 'Error transcribiendo el audio.' });
    }

    const transcript = clean(transcriptionData?.text || '');
    if (!transcript) return res.status(500).json({ ok: false, error: 'No se recibio transcripcion.' });

    const translationResponse = await fetch(getBaseUrl(req) + '/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: transcript, direction: 'pt-es' })
    });

    const translationData = await translationResponse.json().catch(() => null);
    if (!translationResponse.ok || !translationData?.ok) {
      return res.status(translationResponse.status || 500).json({ ok: false, error: translationData?.error || 'No se pudo traducir la transcripcion.' });
    }

    return res.status(200).json({ ok: true, transcript, spanish: translationData.translatedText });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error interno.' });
  }
};

function normalizeAudioFileName(fileName, mimeType) {
  const cleanName = String(fileName || 'audio.webm')
    .split(';')[0]
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-');

  const lowerName = cleanName.toLowerCase();
  if (lowerName.endsWith('.opus')) return cleanName.replace(/\.opus$/i, '.ogg');
  if (lowerName.endsWith('.ogg')) return cleanName;
  if (lowerName.endsWith('.webm')) return cleanName;
  if (lowerName.endsWith('.mp3')) return cleanName;
  if (lowerName.endsWith('.m4a')) return cleanName;
  if (lowerName.endsWith('.wav')) return cleanName;
  if (mimeType.includes('ogg')) return `${cleanName.replace(/\.[^.]+$/, '')}.ogg`;
  if (mimeType.includes('webm')) return `${cleanName.replace(/\.[^.]+$/, '')}.webm`;
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return `${cleanName.replace(/\.[^.]+$/, '')}.mp3`;
  if (mimeType.includes('wav')) return `${cleanName.replace(/\.[^.]+$/, '')}.wav`;
  return `${cleanName.replace(/\.[^.]+$/, '')}.webm`;
}

function normalizeMimeType(mimeType) {
  const cleanMime = String(mimeType || '').split(';')[0].trim().toLowerCase();
  if (cleanMime === 'audio/ogg' || cleanMime === 'application/ogg') return 'audio/ogg';
  if (cleanMime === 'audio/opus') return 'audio/ogg';
  if (cleanMime === 'audio/webm' || cleanMime === 'video/webm') return 'audio/webm';
  if (cleanMime === 'audio/mpeg' || cleanMime === 'audio/mp3') return 'audio/mpeg';
  if (cleanMime === 'audio/mp4' || cleanMime === 'audio/m4a') return 'audio/mp4';
  if (cleanMime === 'audio/wav' || cleanMime === 'audio/x-wav') return 'audio/wav';
  return cleanMime || 'application/octet-stream';
}

function clean(value) {
  return String(value || '').replace(/^```[a-z]*\s*/i, '').replace(/```$/i, '').replace(/^['"“”]+|['"“”]+$/g, '').trim();
}

function getBaseUrl(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

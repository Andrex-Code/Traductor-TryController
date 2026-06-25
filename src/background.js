const MENU_TRANSLATE = 'ikono-translate-selection';
const MENU_FALAR = 'ikono-falar-selection';

const DEFAULTS = {
  provider: 'backend-openai',
  backendUrl: 'https://traductor-try-controller.vercel.app',
  libreTranslateUrl: 'http://localhost:5000/translate'
};

const MYMEMORY_MAX_CHARS = 450;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU_TRANSLATE, title: 'Traducir PT-BR → Español', contexts: ['selection'] });
    chrome.contextMenus.create({ id: MENU_FALAR, title: 'Falar Español → PT-BR', contexts: ['selection', 'editable'] });
  });

  chrome.storage.sync.get(Object.keys(DEFAULTS), (settings) => {
    chrome.storage.sync.set({ ...DEFAULTS, ...removeEmptyDefaults(settings) });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id || !info.selectionText) return;
  const direction = info.menuItemId === MENU_TRANSLATE ? 'pt-es' : 'es-pt';
  const label = info.menuItemId === MENU_TRANSLATE ? 'Traducción' : 'Falar';
  chrome.tabs.sendMessage(tab.id, { type: 'IKONO_TRANSLATE_SELECTION', text: info.selectionText, direction, label });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'IKONO_TRANSLATE') {
    translate(message.text, message.direction)
      .then((translatedText) => sendResponse({ ok: true, translatedText }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === 'IKONO_TRANSCRIBE_AUDIO') {
    transcribeAudio(message.audioBase64, message.fileName, message.mimeType)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});

async function translate(text, direction) {
  const settings = await chrome.storage.sync.get(Object.keys(DEFAULTS));
  const provider = settings.provider || DEFAULTS.provider;

  if (provider === 'backend-openai') return translateWithBackend(text, direction, settings.backendUrl);
  if (provider === 'mymemory-free') return translateWithMyMemory(text, direction);
  if (provider === 'libretranslate-local') return translateWithLibreTranslate(text, direction, settings.libreTranslateUrl);
  return translateOfflineBasic(text, direction);
}

async function transcribeAudio(audioBase64, fileName, mimeType) {
  const settings = await chrome.storage.sync.get(Object.keys(DEFAULTS));
  const backendUrl = normalizeBackendUrl(settings.backendUrl);
  if (!backendUrl) throw new Error('Falta configurar la URL del backend en Opciones.');

  const response = await fetch(`${backendUrl}/api/transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audioBase64, fileName, mimeType })
  });

  const data = await safeJson(response);
  if (!response.ok || !data?.ok) throw new Error(data?.error || `Backend respondió ${response.status}.`);
  return { transcript: data.transcript, spanish: data.spanish };
}

async function translateWithBackend(text, direction, backendUrlValue) {
  const backendUrl = normalizeBackendUrl(backendUrlValue);
  if (!backendUrl) throw new Error('Falta configurar la URL del backend en Opciones.');

  const response = await fetch(`${backendUrl}/api/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, direction })
  });

  const data = await safeJson(response);
  if (!response.ok || !data?.ok) throw new Error(data?.error || `Backend respondió ${response.status}.`);
  return cleanupTranslation(data.translatedText || '');
}

async function translateWithMyMemory(text, direction) {
  const chunks = splitTextIntoChunks(text, MYMEMORY_MAX_CHARS);
  const translatedChunks = [];
  for (const chunk of chunks) {
    translatedChunks.push(await translateMyMemoryChunk(chunk, direction));
    await wait(180);
  }
  return cleanupTranslation(translatedChunks.join('\n\n'));
}

async function translateMyMemoryChunk(text, direction) {
  const langpair = direction === 'pt-es' ? 'pt-BR|es' : 'es|pt-BR';
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(langpair)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`MyMemory respondió ${response.status}. Intenta otro proveedor.`);
  const data = await response.json();
  const translated = data?.responseData?.translatedText;
  if (!translated) throw new Error('MyMemory no devolvió traducción.');
  return cleanupTranslation(translated);
}

async function translateWithLibreTranslate(text, direction, endpoint) {
  const [source, target] = direction === 'pt-es' ? ['pt', 'es'] : ['es', 'pt'];
  const response = await fetch(endpoint || DEFAULTS.libreTranslateUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, source, target, format: 'text' })
  });
  if (!response.ok) throw new Error(`LibreTranslate local respondió ${response.status}. Revisa que el servidor esté encendido.`);
  const data = await response.json();
  return data.translatedText || data.translation || text;
}

function translateOfflineBasic(text, direction) {
  const dictionary = direction === 'pt-es' ? PT_ES : ES_PT;
  let output = text;
  const entries = Object.entries(dictionary).sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of entries) {
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    output = output.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), preserveCase(to));
  }
  if (output === text) return `[Modo básico offline] ${text}\n\nActiva Backend seguro, MyMemory o LibreTranslate local en Opciones para traducción completa.`;
  return output;
}

function splitTextIntoChunks(text, maxChars) {
  const cleanText = String(text || '').trim();
  if (cleanText.length <= maxChars) return [cleanText];
  const sentences = cleanText.match(/[^.!?。！？\n]+[.!?。！？\n]*/g) || [cleanText];
  const chunks = [];
  let current = '';
  for (const sentence of sentences) {
    const piece = sentence.trim();
    if (!piece) continue;
    if (piece.length > maxChars) {
      if (current) { chunks.push(current.trim()); current = ''; }
      chunks.push(...splitLongPiece(piece, maxChars));
      continue;
    }
    const next = current ? `${current} ${piece}` : piece;
    if (next.length > maxChars) { chunks.push(current.trim()); current = piece; }
    else current = next;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function splitLongPiece(text, maxChars) {
  const words = text.split(/\s+/);
  const chunks = [];
  let current = '';
  for (const word of words) {
    if (word.length > maxChars) {
      if (current) { chunks.push(current.trim()); current = ''; }
      for (let index = 0; index < word.length; index += maxChars) chunks.push(word.slice(index, index + maxChars));
      continue;
    }
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars) { chunks.push(current.trim()); current = word; }
    else current = next;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

async function safeJson(response) {
  try { return await response.json(); } catch { return null; }
}

function normalizeBackendUrl(value) {
  return String(value || DEFAULTS.backendUrl || '').trim().replace(/\/$/, '');
}

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function cleanupTranslation(value) {
  return String(value).replace(/^```[a-z]*\s*/i, '').replace(/```$/i, '').replace(/^['"“”]+|['"“”]+$/g, '').trim();
}

function preserveCase(replacement) {
  return (match) => {
    if (match === match.toUpperCase()) return replacement.toUpperCase();
    if (match[0] === match[0].toUpperCase()) return replacement[0].toUpperCase() + replacement.slice(1);
    return replacement;
  };
}

function removeEmptyDefaults(settings) {
  return Object.fromEntries(Object.entries(settings).filter(([, value]) => value !== undefined && value !== null && value !== ''));
}

const PT_ES = {
  'bom dia': 'buenos días',
  'boa tarde': 'buenas tardes',
  'boa noite': 'buenas noches',
  'obrigado': 'gracias',
  'obrigada': 'gracias',
  'por favor': 'por favor',
  'preciso de ajuda': 'necesito ayuda',
  'quero pagar': 'quiero pagar',
  'não consigo': 'no puedo',
  'nao consigo': 'no puedo',
  'qual é o valor': 'cuál es el valor',
  'qual e o valor': 'cuál es el valor',
  'meu empréstimo': 'mi préstamo',
  'meu emprestimo': 'mi préstamo',
  'atendente': 'asesor',
  'dinheiro': 'dinero',
  'pagamento': 'pago',
  'boleto': 'recibo / boleto',
  'parcela': 'cuota',
  'vencimento': 'vencimiento',
  'hoje': 'hoy',
  'amanhã': 'mañana',
  'amanha': 'mañana',
  'sim': 'sí',
  'não': 'no',
  'nao': 'no'
};

const ES_PT = {
  'buenos días': 'bom dia',
  'buenas tardes': 'boa tarde',
  'buenas noches': 'boa noite',
  'gracias': 'obrigado',
  'por favor': 'por favor',
  'necesito ayuda': 'preciso de ajuda',
  'quiero pagar': 'quero pagar',
  'no puedo': 'não consigo',
  'cuál es el valor': 'qual é o valor',
  'cual es el valor': 'qual é o valor',
  'mi préstamo': 'meu empréstimo',
  'mi prestamo': 'meu empréstimo',
  'asesor': 'atendente',
  'dinero': 'dinheiro',
  'pago': 'pagamento',
  'recibo': 'boleto',
  'cuota': 'parcela',
  'vencimiento': 'vencimento',
  'hoy': 'hoje',
  'mañana': 'amanhã',
  'manana': 'amanhã',
  'sí': 'sim',
  'si': 'sim',
  'no': 'não'
};

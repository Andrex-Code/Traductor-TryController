const MENU_TRANSLATE = 'ikono-translate-selection';
const MENU_FALAR = 'ikono-falar-selection';

const DEFAULTS = {
  provider: 'mymemory-free',
  libreTranslateUrl: 'http://localhost:5000/translate',
  nvidiaApiKey: '',
  nvidiaModel: 'deepseek-ai/deepseek-r1',
  openaiApiKey: '',
  openaiTranscriptionModel: 'gpt-4o-mini-transcribe'
};

const MYMEMORY_MAX_CHARS = 450;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_TRANSLATE,
      title: 'Traducir PT-BR → Español',
      contexts: ['selection']
    });

    chrome.contextMenus.create({
      id: MENU_FALAR,
      title: 'Falar Español → PT-BR',
      contexts: ['selection', 'editable']
    });
  });

  chrome.storage.sync.get(Object.keys(DEFAULTS), (settings) => {
    chrome.storage.sync.set({ ...DEFAULTS, ...removeEmptyDefaults(settings) });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id || !info.selectionText) return;

  const direction = info.menuItemId === MENU_TRANSLATE ? 'pt-es' : 'es-pt';
  const label = info.menuItemId === MENU_TRANSLATE ? 'Traducción' : 'Falar';

  chrome.tabs.sendMessage(tab.id, {
    type: 'IKONO_TRANSLATE_SELECTION',
    text: info.selectionText,
    direction,
    label
  });
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

async function transcribeAudio(audioBase64, fileName, mimeType) {
  const settings = await chrome.storage.sync.get(Object.keys(DEFAULTS));

  if (!settings.openaiApiKey) {
    throw new Error('Falta la OpenAI API Key. Agrega la clave en Opciones para transcribir audios.');
  }

  const audioBlob = base64ToBlob(audioBase64, mimeType || 'application/octet-stream');
  const normalizedFileName = normalizeAudioFileName(fileName || 'audio.webm', mimeType);

  const formData = new FormData();
  formData.append('file', audioBlob, normalizedFileName);
  formData.append('model', settings.openaiTranscriptionModel || DEFAULTS.openaiTranscriptionModel);
  formData.append('language', 'pt');
  formData.append('prompt', 'Audio de un cliente en portugués brasileño dentro de un chat de atención al cliente. Transcribe con claridad, manteniendo nombres propios cuando sea posible.');
  formData.append('response_format', 'json');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${settings.openaiApiKey}`
    },
    body: formData
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`OpenAI respondió ${response.status}. ${errorText.slice(0, 220)}`);
  }

  const data = await response.json();
  const transcript = cleanupTranslation(data?.text || '');

  if (!transcript) {
    throw new Error('No se recibió transcripción del audio.');
  }

  const spanish = await translate(transcript, 'pt-es');
  return { transcript, spanish };
}

async function translate(text, direction) {
  const settings = await chrome.storage.sync.get(Object.keys(DEFAULTS));
  const provider = settings.provider || DEFAULTS.provider;

  if (provider === 'mymemory-free') {
    return translateWithMyMemory(text, direction);
  }

  if (provider === 'libretranslate-local') {
    return translateWithLibreTranslate(text, direction, settings.libreTranslateUrl);
  }

  if (provider === 'nvidia-deepseek') {
    return translateWithNvidiaDeepSeek(text, direction, settings.nvidiaApiKey, settings.nvidiaModel);
  }

  return translateOfflineBasic(text, direction);
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

  if (!response.ok) {
    throw new Error(`MyMemory respondió ${response.status}. Intenta otro proveedor o divide el texto.`);
  }

  const data = await response.json();
  const translated = data?.responseData?.translatedText;

  if (!translated) {
    throw new Error('MyMemory no devolvió traducción para una parte del texto.');
  }

  return cleanupTranslation(translated);
}

async function translateWithLibreTranslate(text, direction, endpoint) {
  const [source, target] = direction === 'pt-es' ? ['pt', 'es'] : ['es', 'pt'];
  const response = await fetch(endpoint || DEFAULTS.libreTranslateUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, source, target, format: 'text' })
  });

  if (!response.ok) {
    throw new Error(`LibreTranslate local respondió ${response.status}. Revisa que el servidor esté encendido.`);
  }

  const data = await response.json();
  return data.translatedText || data.translation || text;
}

async function translateWithNvidiaDeepSeek(text, direction, apiKey, model) {
  if (!apiKey) {
    throw new Error('Falta la NVIDIA API Key. Agrega la clave en Opciones.');
  }

  const targetLanguage = direction === 'pt-es' ? 'español colombiano claro y natural' : 'portugués brasileño claro y natural';
  const sourceLanguage = direction === 'pt-es' ? 'portugués brasileño' : 'español';

  const prompt = `Traduce el siguiente texto de ${sourceLanguage} a ${targetLanguage}. Devuelve únicamente la traducción, sin explicaciones, sin comillas y sin notas.\n\nTexto:\n${text}`;

  const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || DEFAULTS.nvidiaModel,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      top_p: 0.7,
      max_tokens: 800,
      stream: false
    })
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`NVIDIA respondió ${response.status}. ${errorText.slice(0, 160)}`);
  }

  const data = await response.json();
  const translated = data?.choices?.[0]?.message?.content;

  if (!translated) {
    throw new Error('NVIDIA no devolvió traducción.');
  }

  return cleanupTranslation(translated);
}

function translateOfflineBasic(text, direction) {
  const dictionary = direction === 'pt-es' ? PT_ES : ES_PT;
  let output = text;

  const entries = Object.entries(dictionary).sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of entries) {
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    output = output.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), preserveCase(to));
  }

  if (output === text) {
    return `[Modo básico offline] ${text}\n\nActiva MyMemory gratis, LibreTranslate local o NVIDIA DeepSeek en Opciones para traducción completa.`;
  }

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
      if (current) {
        chunks.push(current.trim());
        current = '';
      }
      chunks.push(...splitLongPiece(piece, maxChars));
      continue;
    }

    const next = current ? `${current} ${piece}` : piece;
    if (next.length > maxChars) {
      chunks.push(current.trim());
      current = piece;
    } else {
      current = next;
    }
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
      if (current) {
        chunks.push(current.trim());
        current = '';
      }
      for (let index = 0; index < word.length; index += maxChars) {
        chunks.push(word.slice(index, index + maxChars));
      }
      continue;
    }

    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars) {
      chunks.push(current.trim());
      current = word;
    } else {
      current = next;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function base64ToBlob(base64, mimeType) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

function normalizeAudioFileName(fileName, mimeType) {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith('.opus')) return fileName.replace(/\.opus$/i, '.ogg');
  if (lowerName.includes('.')) return fileName;
  if (mimeType?.includes('ogg')) return `${fileName}.ogg`;
  if (mimeType?.includes('webm')) return `${fileName}.webm`;
  if (mimeType?.includes('mpeg')) return `${fileName}.mp3`;
  return `${fileName}.webm`;
}

function cleanupTranslation(value) {
  return String(value)
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/```$/i, '')
    .replace(/^['"“”]+|['"“”]+$/g, '')
    .trim();
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

const MENU_TRANSLATE = 'ikono-translate-selection';
const MENU_FALAR = 'ikono-falar-selection';

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

  chrome.storage.sync.set({
    provider: 'offline-basic',
    libreTranslateUrl: 'http://localhost:5000/translate'
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
  if (message?.type !== 'IKONO_TRANSLATE') return false;

  translate(message.text, message.direction)
    .then((translatedText) => sendResponse({ ok: true, translatedText }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});

async function translate(text, direction) {
  const settings = await chrome.storage.sync.get(['provider', 'libreTranslateUrl']);

  if (settings.provider === 'libretranslate-local') {
    return translateWithLibreTranslate(text, direction, settings.libreTranslateUrl);
  }

  return translateOfflineBasic(text, direction);
}

async function translateWithLibreTranslate(text, direction, endpoint) {
  const [source, target] = direction === 'pt-es' ? ['pt', 'es'] : ['es', 'pt'];
  const response = await fetch(endpoint || 'http://localhost:5000/translate', {
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

function translateOfflineBasic(text, direction) {
  const dictionary = direction === 'pt-es' ? PT_ES : ES_PT;
  let output = text;

  const entries = Object.entries(dictionary).sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of entries) {
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    output = output.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), preserveCase(to));
  }

  if (output === text) {
    return `[Modo básico offline] ${text}\n\nActiva LibreTranslate local en Opciones para traducción completa.`;
  }

  return output;
}

function preserveCase(replacement) {
  return (match) => {
    if (match === match.toUpperCase()) return replacement.toUpperCase();
    if (match[0] === match[0].toUpperCase()) return replacement[0].toUpperCase() + replacement.slice(1);
    return replacement;
  };
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

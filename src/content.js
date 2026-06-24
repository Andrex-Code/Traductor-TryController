let currentBubble;
let currentToolbar;
let lastSelectedText = '';
let lastSelectionRange = null;
let toolbarTimer;

chrome.runtime.onMessage.addListener(async (message) => {
  if (message?.type !== 'IKONO_TRANSLATE_SELECTION') return;
  await runTranslation(message.text, message.direction, message.label);
});

document.addEventListener('mouseup', scheduleSelectionToolbar, true);
document.addEventListener('keyup', scheduleSelectionToolbar, true);
document.addEventListener('selectionchange', () => {
  clearTimeout(toolbarTimer);
  toolbarTimer = setTimeout(showSelectionToolbar, 180);
});

document.addEventListener('scroll', () => removeToolbar(), true);
window.addEventListener('resize', () => removeToolbar());

document.addEventListener('mousedown', (event) => {
  if (event.target.closest?.('.ikono-translator-toolbar, .ikono-translator-bubble')) return;
  removeToolbar();
}, true);

function scheduleSelectionToolbar() {
  clearTimeout(toolbarTimer);
  toolbarTimer = setTimeout(showSelectionToolbar, 120);
}

function showSelectionToolbar() {
  const selectionData = getSelectionData();

  if (!selectionData.text || selectionData.text.length < 2) {
    removeToolbar();
    return;
  }

  lastSelectedText = selectionData.text;
  lastSelectionRange = selectionData.range?.cloneRange?.() || null;

  if (currentToolbar) currentToolbar.remove();

  currentToolbar = document.createElement('div');
  currentToolbar.className = 'ikono-translator-toolbar';
  currentToolbar.innerHTML = `
    <button type="button" data-action="translate">Traducir</button>
    <button type="button" data-action="falar">Falar</button>
  `;

  document.body.appendChild(currentToolbar);
  placeElementNearRect(currentToolbar, selectionData.rect, 190);

  currentToolbar.querySelector('[data-action="translate"]').addEventListener('mousedown', preventFocusLoss);
  currentToolbar.querySelector('[data-action="falar"]').addEventListener('mousedown', preventFocusLoss);

  currentToolbar.querySelector('[data-action="translate"]').addEventListener('click', async () => {
    await runTranslation(lastSelectedText, 'pt-es', 'Traducción');
  });

  currentToolbar.querySelector('[data-action="falar"]').addEventListener('click', async () => {
    await runTranslation(lastSelectedText, 'es-pt', 'Falar');
  });
}

async function runTranslation(text, direction, label) {
  removeToolbar();
  restoreSelectionIfPossible();
  showBubble({ title: label, original: text, translated: 'Traduciendo...' });

  const response = await chrome.runtime.sendMessage({
    type: 'IKONO_TRANSLATE',
    text,
    direction
  });

  if (!response?.ok) {
    showBubble({
      title: 'Error de traducción',
      original: text,
      translated: response?.error || 'No se pudo traducir.'
    });
    return;
  }

  showBubble({ title: label, original: text, translated: response.translatedText });

  if (direction === 'es-pt') {
    replaceEditableSelection(response.translatedText);
  }
}

function getSelectionData() {
  const active = document.activeElement;
  const isTextInput = active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT');

  if (isTextInput && typeof active.selectionStart === 'number' && active.selectionStart !== active.selectionEnd) {
    const text = active.value.slice(active.selectionStart, active.selectionEnd).trim();
    const rect = active.getBoundingClientRect();
    return { text, rect, range: null };
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return { text: '', rect: null, range: null };
  }

  const text = selection.toString().trim();
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  return { text, rect, range };
}

function showBubble({ title, original, translated }) {
  if (currentBubble) currentBubble.remove();

  currentBubble = document.createElement('div');
  currentBubble.className = 'ikono-translator-bubble';
  currentBubble.innerHTML = `
    <div class="ikono-translator-header">
      <strong>${escapeHtml(title)}</strong>
      <button type="button" aria-label="Cerrar">×</button>
    </div>
    <div class="ikono-translator-section">
      <span>Texto seleccionado</span>
      <p>${escapeHtml(original)}</p>
    </div>
    <div class="ikono-translator-section ikono-translator-result">
      <span>Resultado</span>
      <p>${escapeHtml(translated)}</p>
    </div>
    <div class="ikono-translator-actions">
      <button type="button" data-copy>Copiar</button>
    </div>
  `;

  document.body.appendChild(currentBubble);

  const selectionData = getSelectionData();
  placeElementNearRect(currentBubble, selectionData.rect, 360);

  currentBubble.querySelector('[aria-label="Cerrar"]').addEventListener('click', () => currentBubble.remove());
  currentBubble.querySelector('[data-copy]').addEventListener('click', async () => {
    await navigator.clipboard.writeText(translated);
    currentBubble.querySelector('[data-copy]').textContent = 'Copiado';
  });
}

function placeElementNearRect(element, rect, expectedWidth) {
  const fallbackTop = window.scrollY + 90;
  const fallbackLeft = window.scrollX + 24;

  const safeRect = rect && rect.width !== 0 && rect.height !== 0 ? rect : null;
  const top = Math.max(16, (safeRect?.bottom || fallbackTop) + window.scrollY + 8);
  const maxLeft = window.scrollX + window.innerWidth - expectedWidth - 16;
  const left = Math.min(maxLeft, Math.max(window.scrollX + 16, (safeRect?.left || fallbackLeft) + window.scrollX));

  element.style.top = `${top}px`;
  element.style.left = `${left}px`;
}

function replaceEditableSelection(text) {
  const active = document.activeElement;
  const isTextInput = active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT');

  if (isTextInput && typeof active.selectionStart === 'number') {
    const start = active.selectionStart;
    const end = active.selectionEnd;
    active.value = active.value.slice(0, start) + text + active.value.slice(end);
    active.selectionStart = active.selectionEnd = start + text.length;
    active.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }

  restoreSelectionIfPossible();

  if (document.activeElement?.isContentEditable || lastSelectionRange) {
    document.execCommand('insertText', false, text);
  }
}

function restoreSelectionIfPossible() {
  if (!lastSelectionRange) return;
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(lastSelectionRange);
}

function removeToolbar() {
  if (currentToolbar) {
    currentToolbar.remove();
    currentToolbar = null;
  }
}

function preventFocusLoss(event) {
  event.preventDefault();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

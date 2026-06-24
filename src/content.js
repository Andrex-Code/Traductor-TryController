let currentBubble;

chrome.runtime.onMessage.addListener(async (message) => {
  if (message?.type !== 'IKONO_TRANSLATE_SELECTION') return;

  showBubble({ title: message.label, original: message.text, translated: 'Traduciendo...' });

  const response = await chrome.runtime.sendMessage({
    type: 'IKONO_TRANSLATE',
    text: message.text,
    direction: message.direction
  });

  if (!response?.ok) {
    showBubble({
      title: 'Error de traducción',
      original: message.text,
      translated: response?.error || 'No se pudo traducir.'
    });
    return;
  }

  showBubble({ title: message.label, original: message.text, translated: response.translatedText });

  if (message.direction === 'es-pt') {
    replaceEditableSelection(response.translatedText);
  }
});

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
  placeBubbleNearSelection(currentBubble);

  currentBubble.querySelector('[aria-label="Cerrar"]').addEventListener('click', () => currentBubble.remove());
  currentBubble.querySelector('[data-copy]').addEventListener('click', async () => {
    await navigator.clipboard.writeText(translated);
    currentBubble.querySelector('[data-copy]').textContent = 'Copiado';
  });
}

function placeBubbleNearSelection(element) {
  const selection = window.getSelection();
  const rect = selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : null;
  const top = Math.max(16, (rect?.bottom || 80) + window.scrollY + 8);
  const left = Math.min(window.innerWidth - 360, Math.max(16, (rect?.left || 40) + window.scrollX));

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

  if (active?.isContentEditable) {
    document.execCommand('insertText', false, text);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

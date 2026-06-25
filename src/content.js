let currentBubble;
let currentToolbar;
let edgeLauncher;
let edgePanel;
let edgeAudioInput;
let lastSelectedText = '';
let lastSelectionRange = null;
let lastTextInputSelection = null;
let toolbarTimer;
let showCornerButton = true;
let launcherPosition = null;
let launcherDragState = null;

chrome.runtime.onMessage.addListener(async (message) => {
  if (message?.type !== 'IKONO_TRANSLATE_SELECTION') return;
  await runTranslation(message.text, message.direction, message.label);
});

initSettings();

document.addEventListener('mouseup', scheduleSelectionToolbar, true);
document.addEventListener('keyup', scheduleSelectionToolbar, true);
document.addEventListener('selectionchange', () => {
  clearTimeout(toolbarTimer);
  toolbarTimer = setTimeout(showSelectionToolbar, 180);
});

document.addEventListener('scroll', () => removeToolbar(), true);
window.addEventListener('resize', () => {
  removeToolbar();
  positionEdgePanelNearLauncher();
});

document.addEventListener('mousedown', (event) => {
  if (event.target.closest?.('.ikono-translator-toolbar, .ikono-translator-bubble, .ikono-translator-launcher, .ikono-translator-panel')) return;
  removeToolbar();
  hideEdgePanel();
}, true);

function initSettings() {
  chrome.storage.sync.get(['showCornerButton', 'launcherPosition'], (settings) => {
    showCornerButton = settings.showCornerButton ?? true;
    launcherPosition = settings.launcherPosition || null;
    if (showCornerButton) initEdgeFallbackLauncher();
    else removeEdgeFallbackLauncher();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') return;

    if (changes.launcherPosition) {
      launcherPosition = changes.launcherPosition.newValue || null;
      applyLauncherPosition();
    }

    if (changes.showCornerButton) {
      showCornerButton = changes.showCornerButton.newValue ?? true;
      if (showCornerButton) initEdgeFallbackLauncher();
      else removeEdgeFallbackLauncher();
    }
  });
}

function initEdgeFallbackLauncher() {
  if (!showCornerButton) return;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createEdgeFallbackLauncher, { once: true });
  } else {
    createEdgeFallbackLauncher();
  }
}

function createEdgeFallbackLauncher() {
  if (!showCornerButton || edgeLauncher || !document.body) return;

  edgeLauncher = document.createElement('button');
  edgeLauncher.className = 'ikono-translator-launcher';
  edgeLauncher.type = 'button';
  edgeLauncher.title = 'Traductor iKono ONOFF. Clic para abrir. Mantén presionado para mover.';
  edgeLauncher.innerHTML = `<img alt="ONOFF" src="${chrome.runtime.getURL('icons/icon48.png')}" />`;

  edgePanel = document.createElement('div');
  edgePanel.className = 'ikono-translator-panel';
  edgePanel.hidden = true;
  edgePanel.innerHTML = `
    <button type="button" data-action="translate">Traducir selección</button>
    <button type="button" data-action="falar">Falar selección</button>
    <button type="button" data-action="audio">Cargar audio</button>
    <input class="ikono-translator-audio-input" type="file" accept="audio/*,.opus,.ogg,.webm,.mp3,.m4a,.wav" hidden />
  `;

  document.body.appendChild(edgeLauncher);
  document.body.appendChild(edgePanel);

  edgeAudioInput = edgePanel.querySelector('.ikono-translator-audio-input');

  applyLauncherPosition();
  edgePanel.addEventListener('mousedown', preventFocusLoss);
  edgeLauncher.addEventListener('pointerdown', startLauncherPointerInteraction);

  edgePanel.querySelector('[data-action="translate"]').addEventListener('click', async () => {
    const text = rememberCurrentSelection();
    if (!text) return showNoSelectionBubble();
    await runTranslation(text, 'pt-es', 'Traducción');
    hideEdgePanel();
  });

  edgePanel.querySelector('[data-action="falar"]').addEventListener('click', async () => {
    const text = rememberCurrentSelection();
    if (!text) return showNoSelectionBubble();
    await runTranslation(text, 'es-pt', 'Falar');
    hideEdgePanel();
  });

  edgePanel.querySelector('[data-action="audio"]').addEventListener('click', () => {
    edgeAudioInput.value = '';
    edgeAudioInput.click();
  });

  edgeAudioInput.addEventListener('change', async () => {
    const file = edgeAudioInput.files?.[0];
    if (!file) return;
    await transcribeUploadedAudio(file);
    hideEdgePanel();
  });
}

function startLauncherPointerInteraction(event) {
  event.preventDefault();
  rememberCurrentSelection();

  const rect = edgeLauncher.getBoundingClientRect();
  launcherDragState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    left: rect.left,
    top: rect.top,
    dragging: false,
    holdTimer: window.setTimeout(() => {
      if (!launcherDragState) return;
      launcherDragState.dragging = true;
      edgeLauncher.classList.add('is-dragging');
      edgeLauncher.setPointerCapture?.(event.pointerId);
      hideEdgePanel();
    }, 260)
  };

  window.addEventListener('pointermove', moveLauncherPointerInteraction, true);
  window.addEventListener('pointerup', endLauncherPointerInteraction, true);
  window.addEventListener('pointercancel', endLauncherPointerInteraction, true);
}

function moveLauncherPointerInteraction(event) {
  if (!launcherDragState) return;

  if (!launcherDragState.dragging) return;

  const nextLeft = clamp(launcherDragState.left + event.clientX - launcherDragState.startX, 8, window.innerWidth - edgeLauncher.offsetWidth - 8);
  const nextTop = clamp(launcherDragState.top + event.clientY - launcherDragState.startY, 8, window.innerHeight - edgeLauncher.offsetHeight - 8);

  launcherPosition = { left: Math.round(nextLeft), top: Math.round(nextTop) };
  applyLauncherPosition();
}

function endLauncherPointerInteraction(event) {
  if (!launcherDragState) return;

  window.clearTimeout(launcherDragState.holdTimer);
  window.removeEventListener('pointermove', moveLauncherPointerInteraction, true);
  window.removeEventListener('pointerup', endLauncherPointerInteraction, true);
  window.removeEventListener('pointercancel', endLauncherPointerInteraction, true);

  const wasDragging = launcherDragState.dragging;
  launcherDragState = null;
  edgeLauncher.classList.remove('is-dragging');
  edgeLauncher.releasePointerCapture?.(event.pointerId);

  if (wasDragging) {
    chrome.storage.sync.set({ launcherPosition });
    return;
  }

  toggleEdgePanel();
}

function applyLauncherPosition() {
  if (!edgeLauncher) return;

  if (!launcherPosition) {
    edgeLauncher.style.left = '';
    edgeLauncher.style.top = '';
    edgeLauncher.style.right = '18px';
    edgeLauncher.style.bottom = '86px';
    positionEdgePanelNearLauncher();
    return;
  }

  const left = clamp(launcherPosition.left, 8, window.innerWidth - edgeLauncher.offsetWidth - 8);
  const top = clamp(launcherPosition.top, 8, window.innerHeight - edgeLauncher.offsetHeight - 8);
  edgeLauncher.style.left = `${left}px`;
  edgeLauncher.style.top = `${top}px`;
  edgeLauncher.style.right = 'auto';
  edgeLauncher.style.bottom = 'auto';
  positionEdgePanelNearLauncher();
}

function toggleEdgePanel() {
  if (!edgePanel) return;
  rememberCurrentSelection();
  edgePanel.hidden = !edgePanel.hidden;
  positionEdgePanelNearLauncher();
}

function positionEdgePanelNearLauncher() {
  if (!edgePanel || edgePanel.hidden || !edgeLauncher) return;

  const rect = edgeLauncher.getBoundingClientRect();
  const panelWidth = edgePanel.offsetWidth || 190;
  const panelHeight = edgePanel.offsetHeight || 150;
  const left = clamp(rect.right - panelWidth, 8, window.innerWidth - panelWidth - 8);
  const top = rect.top > panelHeight + 16 ? rect.top - panelHeight - 8 : rect.bottom + 8;

  edgePanel.style.left = `${left}px`;
  edgePanel.style.top = `${clamp(top, 8, window.innerHeight - panelHeight - 8)}px`;
  edgePanel.style.right = 'auto';
  edgePanel.style.bottom = 'auto';
}

function removeEdgeFallbackLauncher() {
  if (edgeLauncher) edgeLauncher.remove();
  if (edgePanel) edgePanel.remove();
  edgeLauncher = null;
  edgePanel = null;
  edgeAudioInput = null;
}

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

  rememberSelectionData(selectionData);

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

  if (direction === 'es-pt') {
    const replaced = replaceEditableSelection(response.translatedText);
    showBubble({
      title: label,
      original: text,
      translated: replaced
        ? `${response.translatedText}\n\nTexto reemplazado en el campo de escritura.`
        : `${response.translatedText}\n\nNo pude reemplazar automáticamente. Usa Copiar y pégalo en el campo.`
    });
    return;
  }

  showBubble({ title: label, original: text, translated: response.translatedText });
}

async function transcribeUploadedAudio(file) {
  if (file.size > 25 * 1024 * 1024) {
    showBubble({
      title: 'Audio demasiado grande',
      original: file.name,
      translated: 'El archivo supera 25 MB. Usa un audio más corto o conviértelo/comprímelo.'
    });
    return;
  }

  showBubble({ title: 'Transcripción de audio', original: file.name, translated: 'Procesando audio...' });

  try {
    const audioBase64 = await fileToBase64(file);
    const response = await chrome.runtime.sendMessage({
      type: 'IKONO_TRANSCRIBE_AUDIO',
      audioBase64,
      fileName: file.name,
      mimeType: file.type
    });

    if (!response?.ok) {
      throw new Error(response?.error || 'No se pudo transcribir el audio.');
    }

    showBubble({
      title: 'Audio traducido',
      original: response.transcript || file.name,
      translated: response.spanish || 'No se recibió traducción.'
    });
  } catch (error) {
    showBubble({
      title: 'Error de audio',
      original: file.name,
      translated: error.message
    });
  }
}

function getSelectionData() {
  const active = document.activeElement;
  const isTextInput = active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT');

  if (isTextInput && typeof active.selectionStart === 'number' && active.selectionStart !== active.selectionEnd) {
    const start = active.selectionStart;
    const end = active.selectionEnd;
    const text = active.value.slice(start, end).trim();
    const rect = active.getBoundingClientRect();
    return { text, rect, range: null, textInput: active, start, end };
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return { text: '', rect: null, range: null, textInput: null };
  }

  const text = selection.toString().trim();
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  return { text, rect, range, textInput: null };
}

function rememberCurrentSelection() {
  const selectionData = getSelectionData();
  if (selectionData.text && selectionData.text.length >= 2) {
    rememberSelectionData(selectionData);
  }
  return lastSelectedText;
}

function rememberSelectionData(selectionData) {
  lastSelectedText = selectionData.text;
  lastSelectionRange = selectionData.range?.cloneRange?.() || null;
  lastTextInputSelection = selectionData.textInput
    ? { element: selectionData.textInput, start: selectionData.start, end: selectionData.end }
    : null;
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

function showNoSelectionBubble() {
  showBubble({
    title: 'Traductor iKono',
    original: '',
    translated: 'Selecciona un texto primero y luego vuelve a tocar el botón ONOFF.'
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
  if (lastTextInputSelection?.element?.isConnected) {
    const { element, start, end } = lastTextInputSelection;
    element.focus();
    element.value = element.value.slice(0, start) + text + element.value.slice(end);
    element.selectionStart = element.selectionEnd = start + text.length;
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  if (lastSelectionRange) {
    const editableRoot = findEditableRoot(lastSelectionRange.commonAncestorContainer);
    if (editableRoot) {
      editableRoot.focus();
      restoreSelectionIfPossible();
      lastSelectionRange.deleteContents();
      lastSelectionRange.insertNode(document.createTextNode(text));
      lastSelectionRange.collapse(false);
      restoreSelectionIfPossible();
      editableRoot.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      editableRoot.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
  }

  restoreSelectionIfPossible();

  if (document.execCommand('insertText', false, text)) {
    return true;
  }

  return false;
}

function findEditableRoot(node) {
  let element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  while (element && element !== document.body) {
    if (element.isContentEditable) return element;
    element = element.parentElement;
  }
  return null;
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

function hideEdgePanel() {
  if (edgePanel) edgePanel.hidden = true;
}

function preventFocusLoss(event) {
  event.preventDefault();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

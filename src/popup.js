const audioFile = document.querySelector('#audioFile');
const transcribeButton = document.querySelector('#transcribeButton');
const showSelectionButtons = document.querySelector('#showSelectionButtons');
const statusEl = document.querySelector('#status');
const transcriptBox = document.querySelector('#transcriptBox');
const spanishBox = document.querySelector('#spanishBox');
const transcriptEl = document.querySelector('#transcript');
const spanishEl = document.querySelector('#spanish');

chrome.storage.sync.get(['showSelectionButtons'], (settings) => {
  showSelectionButtons.checked = settings.showSelectionButtons ?? true;
});

showSelectionButtons.addEventListener('change', () => {
  chrome.storage.sync.set({ showSelectionButtons: showSelectionButtons.checked });
});

transcribeButton.addEventListener('click', async () => {
  const file = audioFile.files?.[0];

  if (!file) {
    setStatus('Selecciona primero un archivo de audio.', true);
    return;
  }

  if (file.size > 25 * 1024 * 1024) {
    setStatus('El archivo supera 25 MB. Usa un audio más corto o conviértelo/comprímelo.', true);
    return;
  }

  try {
    transcribeButton.disabled = true;
    transcriptBox.hidden = true;
    spanishBox.hidden = true;
    setStatus('Procesando audio...');

    const audioBase64 = await fileToBase64(file);
    const audioMeta = normalizeAudioMetadata(file.name, file.type);
    const response = await chrome.runtime.sendMessage({
      type: 'IKONO_TRANSCRIBE_AUDIO',
      audioBase64,
      fileName: audioMeta.fileName,
      mimeType: audioMeta.mimeType
    });

    if (!response?.ok) {
      throw new Error(response?.error || 'No se pudo transcribir el audio.');
    }

    transcriptEl.textContent = response.transcript || '';
    spanishEl.textContent = response.spanish || '';
    transcriptBox.hidden = false;
    spanishBox.hidden = false;
    setStatus('Listo.');
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    transcribeButton.disabled = false;
  }
});

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

function normalizeAudioMetadata(fileName, mimeType) {
  const cleanMime = String(mimeType || '').split(';')[0].trim().toLowerCase();
  const cleanNameBase = String(fileName || 'audio.ogg')
    .split(';')[0]
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-');

  let normalizedMimeType = cleanMime || 'application/octet-stream';
  if (cleanMime.includes('ogg') || cleanNameBase.toLowerCase().endsWith('.ogg')) normalizedMimeType = 'audio/ogg';
  else if (cleanMime.includes('opus') || cleanNameBase.toLowerCase().endsWith('.opus')) normalizedMimeType = 'audio/ogg';
  else if (cleanMime.includes('webm') || cleanNameBase.toLowerCase().endsWith('.webm')) normalizedMimeType = 'audio/webm';
  else if (cleanMime.includes('mpeg') || cleanMime.includes('mp3') || cleanNameBase.toLowerCase().endsWith('.mp3')) normalizedMimeType = 'audio/mpeg';
  else if (cleanNameBase.toLowerCase().endsWith('.m4a')) normalizedMimeType = 'audio/mp4';
  else if (cleanNameBase.toLowerCase().endsWith('.wav')) normalizedMimeType = 'audio/wav';

  let normalizedFileName = cleanNameBase;
  const lowerName = normalizedFileName.toLowerCase();
  if (lowerName.endsWith('.opus')) normalizedFileName = normalizedFileName.replace(/\.opus$/i, '.ogg');
  else if (!/\.(ogg|webm|mp3|m4a|wav)$/i.test(normalizedFileName)) {
    if (normalizedMimeType.includes('ogg')) normalizedFileName += '.ogg';
    else if (normalizedMimeType.includes('webm')) normalizedFileName += '.webm';
    else if (normalizedMimeType.includes('mpeg')) normalizedFileName += '.mp3';
    else if (normalizedMimeType.includes('mp4')) normalizedFileName += '.m4a';
    else if (normalizedMimeType.includes('wav')) normalizedFileName += '.wav';
    else normalizedFileName += '.ogg';
  }

  return { fileName: normalizedFileName, mimeType: normalizedMimeType };
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.className = isError ? 'status error' : 'status';
}

const audioFile = document.querySelector('#audioFile');
const transcribeButton = document.querySelector('#transcribeButton');
const statusEl = document.querySelector('#status');
const transcriptBox = document.querySelector('#transcriptBox');
const spanishBox = document.querySelector('#spanishBox');
const transcriptEl = document.querySelector('#transcript');
const spanishEl = document.querySelector('#spanish');

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
    const response = await chrome.runtime.sendMessage({
      type: 'IKONO_TRANSCRIBE_AUDIO',
      audioBase64,
      fileName: file.name,
      mimeType: file.type
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

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.className = isError ? 'status error' : 'status';
}

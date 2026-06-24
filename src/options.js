const provider = document.querySelector('#provider');
const libreTranslateUrl = document.querySelector('#libreTranslateUrl');
const nvidiaApiKey = document.querySelector('#nvidiaApiKey');
const nvidiaModel = document.querySelector('#nvidiaModel');
const openaiApiKey = document.querySelector('#openaiApiKey');
const openaiTranscriptionModel = document.querySelector('#openaiTranscriptionModel');
const showCornerButton = document.querySelector('#showCornerButton');
const status = document.querySelector('#status');

const DEFAULTS = {
  provider: 'mymemory-free',
  libreTranslateUrl: 'http://localhost:5000/translate',
  nvidiaApiKey: '',
  nvidiaModel: 'deepseek-ai/deepseek-r1',
  openaiApiKey: '',
  openaiTranscriptionModel: 'gpt-4o-mini-transcribe',
  showCornerButton: true
};

chrome.storage.sync.get(Object.keys(DEFAULTS), (settings) => {
  provider.value = settings.provider || DEFAULTS.provider;
  libreTranslateUrl.value = settings.libreTranslateUrl || DEFAULTS.libreTranslateUrl;
  nvidiaApiKey.value = settings.nvidiaApiKey || DEFAULTS.nvidiaApiKey;
  nvidiaModel.value = settings.nvidiaModel || DEFAULTS.nvidiaModel;
  openaiApiKey.value = settings.openaiApiKey || DEFAULTS.openaiApiKey;
  openaiTranscriptionModel.value = settings.openaiTranscriptionModel || DEFAULTS.openaiTranscriptionModel;
  showCornerButton.checked = settings.showCornerButton ?? DEFAULTS.showCornerButton;
  updateVisibleProviderFields();
});

provider.addEventListener('change', updateVisibleProviderFields);

document.querySelector('#save').addEventListener('click', () => {
  chrome.storage.sync.set({
    provider: provider.value,
    libreTranslateUrl: libreTranslateUrl.value || DEFAULTS.libreTranslateUrl,
    nvidiaApiKey: nvidiaApiKey.value.trim(),
    nvidiaModel: nvidiaModel.value.trim() || DEFAULTS.nvidiaModel,
    openaiApiKey: openaiApiKey.value.trim(),
    openaiTranscriptionModel: openaiTranscriptionModel.value.trim() || DEFAULTS.openaiTranscriptionModel,
    showCornerButton: showCornerButton.checked
  }, () => {
    status.textContent = 'Opciones guardadas. Recarga la página de iKono para aplicar cambios visuales.';
    setTimeout(() => status.textContent = '', 2600);
  });
});

function updateVisibleProviderFields() {
  document.querySelectorAll('[data-provider-box]').forEach((box) => {
    box.hidden = box.dataset.providerBox !== provider.value;
  });
}

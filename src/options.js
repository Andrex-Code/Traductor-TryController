const provider = document.querySelector('#provider');
const libreTranslateUrl = document.querySelector('#libreTranslateUrl');
const nvidiaApiKey = document.querySelector('#nvidiaApiKey');
const nvidiaModel = document.querySelector('#nvidiaModel');
const status = document.querySelector('#status');

const DEFAULTS = {
  provider: 'mymemory-free',
  libreTranslateUrl: 'http://localhost:5000/translate',
  nvidiaApiKey: '',
  nvidiaModel: 'deepseek-ai/deepseek-r1'
};

chrome.storage.sync.get(Object.keys(DEFAULTS), (settings) => {
  provider.value = settings.provider || DEFAULTS.provider;
  libreTranslateUrl.value = settings.libreTranslateUrl || DEFAULTS.libreTranslateUrl;
  nvidiaApiKey.value = settings.nvidiaApiKey || DEFAULTS.nvidiaApiKey;
  nvidiaModel.value = settings.nvidiaModel || DEFAULTS.nvidiaModel;
  updateVisibleProviderFields();
});

provider.addEventListener('change', updateVisibleProviderFields);

document.querySelector('#save').addEventListener('click', () => {
  chrome.storage.sync.set({
    provider: provider.value,
    libreTranslateUrl: libreTranslateUrl.value || DEFAULTS.libreTranslateUrl,
    nvidiaApiKey: nvidiaApiKey.value.trim(),
    nvidiaModel: nvidiaModel.value.trim() || DEFAULTS.nvidiaModel
  }, () => {
    status.textContent = 'Opciones guardadas.';
    setTimeout(() => status.textContent = '', 1600);
  });
});

function updateVisibleProviderFields() {
  document.querySelectorAll('[data-provider-box]').forEach((box) => {
    box.hidden = box.dataset.providerBox !== provider.value;
  });
}

const provider = document.querySelector('#provider');
const backendUrl = document.querySelector('#backendUrl');
const libreTranslateUrl = document.querySelector('#libreTranslateUrl');
const showCornerButton = document.querySelector('#showCornerButton');
const status = document.querySelector('#status');

const DEFAULTS = {
  provider: 'backend-openai',
  backendUrl: 'https://traductor-try-controller.vercel.app',
  libreTranslateUrl: 'http://localhost:5000/translate',
  showCornerButton: true
};

chrome.storage.sync.get(Object.keys(DEFAULTS), (settings) => {
  provider.value = settings.provider || DEFAULTS.provider;
  backendUrl.value = settings.backendUrl || DEFAULTS.backendUrl;
  libreTranslateUrl.value = settings.libreTranslateUrl || DEFAULTS.libreTranslateUrl;
  showCornerButton.checked = settings.showCornerButton ?? DEFAULTS.showCornerButton;
  updateVisibleProviderFields();
});

provider.addEventListener('change', updateVisibleProviderFields);

document.querySelector('#save').addEventListener('click', () => {
  chrome.storage.sync.set({
    provider: provider.value,
    backendUrl: normalizeUrl(backendUrl.value || DEFAULTS.backendUrl),
    libreTranslateUrl: libreTranslateUrl.value || DEFAULTS.libreTranslateUrl,
    showCornerButton: showCornerButton.checked
  }, () => {
    status.textContent = 'Opciones guardadas. Recarga la pagina de iKono para aplicar cambios visuales.';
    setTimeout(() => status.textContent = '', 2600);
  });
});

function updateVisibleProviderFields() {
  document.querySelectorAll('[data-provider-box]').forEach((box) => {
    box.hidden = box.dataset.providerBox !== provider.value;
  });
}

function normalizeUrl(value) {
  const raw = String(value || '').trim();
  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
}

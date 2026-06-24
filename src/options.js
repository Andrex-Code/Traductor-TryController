const provider = document.querySelector('#provider');
const libreTranslateUrl = document.querySelector('#libreTranslateUrl');
const status = document.querySelector('#status');

chrome.storage.sync.get(['provider', 'libreTranslateUrl'], (settings) => {
  provider.value = settings.provider || 'offline-basic';
  libreTranslateUrl.value = settings.libreTranslateUrl || 'http://localhost:5000/translate';
});

document.querySelector('#save').addEventListener('click', () => {
  chrome.storage.sync.set({
    provider: provider.value,
    libreTranslateUrl: libreTranslateUrl.value || 'http://localhost:5000/translate'
  }, () => {
    status.textContent = 'Opciones guardadas.';
    setTimeout(() => status.textContent = '', 1600);
  });
});

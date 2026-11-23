/* iOS-only adapter. Bundled before app.js; normal browsers never load this file. */
(() => {
  'use strict';
  const handler = window.webkit?.messageHandlers?.notebook;
  if (!handler) return;
  const request = (action, payload = {}) => handler.postMessage({ action, payload });
  const keys = new Set(['gemini_api_key', 'openai_api_key']);
  const secrets = Object.assign(Object.create(null), window.__notebookSecrets || {});
  delete window.__notebookSecrets;
  const original = {
    get: Storage.prototype.getItem, set: Storage.prototype.setItem,
    remove: Storage.prototype.removeItem, clear: Storage.prototype.clear
  };
  let writes = Promise.resolve();
  let saveError = null;
  function persist(key, value) {
    writes = writes.then(() => request('saveSecret', { key, value })).then(() => { original.remove.call(localStorage, key); }).catch(error => {
      saveError = error;
      window.app?.showToast('密钥未能保存至钥匙串，请重新保存', 'error');
    });
  }
  // Migrate any earlier localStorage keys into Keychain, and remove their disk copies.
  for (const key of keys) {
    const previous = original.get.call(localStorage, key);
    if (previous && !secrets[key]) { secrets[key] = previous; persist(key, previous); }
    else original.remove.call(localStorage, key);
  }
  Storage.prototype.getItem = function (key) {
    return this === localStorage && keys.has(String(key)) ? secrets[String(key)] || null : original.get.call(this, key);
  };
  Storage.prototype.setItem = function (key, value) {
    if (this === localStorage && String(key) === 'theme') request('appearance', { theme: String(value) }).catch(() => {});
    if (this !== localStorage || !keys.has(String(key))) return original.set.call(this, key, value);
    saveError = null;
    secrets[String(key)] = String(value);
    persist(String(key), String(value));
  };
  Storage.prototype.removeItem = function (key) {
    if (this !== localStorage || !keys.has(String(key))) return original.remove.call(this, key);
    delete secrets[String(key)]; persist(String(key), '');
  };
  Storage.prototype.clear = function () {
    if (this === localStorage) for (const key of keys) { delete secrets[key]; persist(key, ''); }
    return original.clear.call(this);
  };
  window.notebookNative = Object.freeze({
    exportBackup: json => request('exportBackup', { json }),
    showLicenses: () => request('licenses'),
    convertImage: async (file, dimension, quality) => {
      if (file.size > 64 * 1024 * 1024) throw new Error('图片超过 64 MiB，请先缩小后再导入');
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('读取图片失败'));
        reader.readAsDataURL(file);
      });
      return request('convertImage', { base64, dimension, quality });
    },
    print: () => request('print'),
    exportPDF: () => request('exportPDF'),
    flushSecrets: async () => { await writes; if (saveError) throw saveError; }
  });
  document.addEventListener('DOMContentLoaded', () => {
    document.documentElement.classList.add('native-ios');
    request('appearance', { theme: original.get.call(localStorage, 'theme') || 'system' }).catch(() => {});
  });
})();

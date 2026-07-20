const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('patienceQuickAdd', {
  onAccounts: (cb) => ipcRenderer.on('accounts', (_e, list) => cb(list)),
  submit: (accountId, pnl) => ipcRenderer.send('quick-add-submit', { accountId, pnl }),
  close: () => ipcRenderer.send('quick-add-close'),
});

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('patienceDesktop', {
  updateStats: (stats) => ipcRenderer.send('stats', stats),
  onQuickAdd: (cb) => ipcRenderer.on('quick-add', (_e, d) => cb(d)),
  backup: (json) => ipcRenderer.send('backup', json),
  onRestoreBackup: (cb) => ipcRenderer.on('restore-backup', (_e, json) => cb(json)),
});

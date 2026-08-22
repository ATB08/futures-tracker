const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('patienceDesktop', {
  updateStats: (stats) => ipcRenderer.send('stats', stats),
  onQuickAdd: (cb) => ipcRenderer.on('quick-add', (_e, d) => cb(d)),
  backup: (json) => ipcRenderer.send('backup', json),
  onRestoreBackup: (cb) => ipcRenderer.on('restore-backup', (_e, json) => cb(json)),
  // iCloud sync: read the shared cloud data + the local auto-backup (for recovery)
  getSyncData: () => ipcRenderer.invoke('get-sync-data'),
  // write a one-off safety copy before adopting cloud data
  safetyBackup: (json) => ipcRenderer.send('safety-backup', json),
});

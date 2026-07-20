const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('patienceWidget', {
  onStats: (cb) => ipcRenderer.on('stats', (_e, stats) => cb(stats)),
  openApp: () => ipcRenderer.send('open-app'),
  hideWidget: () => ipcRenderer.send('hide-widget'),
});

const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let win = null, widgetWin = null, quickWin = null, tray = null, lastStats = null;
const stateFile = () => path.join(app.getPath('userData'), 'widget-state.json');
const backupFile = () => path.join(app.getPath('userData'), 'Patience-Flow-Backup.json');

const fmt = (n) => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
const fmtS = (n) => (n >= 0 ? '+$' : '-$') + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 });

function loadState() {
  try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch (e) { return {}; }
}
function saveState(patch) {
  const s = Object.assign(loadState(), patch);
  try { fs.writeFileSync(stateFile(), JSON.stringify(s)); } catch (e) {}
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 17 },
    backgroundColor: '#0f172a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    title: 'Patience Flow',
  });

  win.loadFile(path.join(__dirname, 'Patience-Flow.html'));
  win.on('closed', () => { win = null; });

  const menuTemplate = [
    {
      label: 'Patience Flow',
      submenu: [
        { role: 'about', label: 'About Patience Flow' },
        { type: 'separator' },
        { label: 'Show Mini Widget', click: () => toggleWidget() },
        { type: 'separator' },
        { label: 'Reveal Auto-Backup File', click: () => { if (fs.existsSync(backupFile())) shell.showItemInFolder(backupFile()); } },
        { label: 'Restore from Auto-Backup', click: () => restoreFromBackup() },
        { type: 'separator' },
        { role: 'hide', label: 'Hide' },
        { role: 'hideOthers' },
        { type: 'separator' },
        { role: 'quit', label: 'Quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' }, { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
}

function widgetHeight() {
  return lastStats && lastStats.todayNews && lastStats.todayNews.length ? 236 : 168;
}

function createWidget() {
  const st = loadState();
  const { workArea } = screen.getPrimaryDisplay();
  widgetWin = new BrowserWindow({
    width: 240,
    height: widgetHeight(),
    x: typeof st.x === 'number' ? st.x : workArea.x + workArea.width - 260,
    y: typeof st.y === 'number' ? st.y : workArea.y + 20,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    visibleOnAllWorkspaces: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'widget-preload.js'),
    },
  });
  widgetWin.loadFile(path.join(__dirname, 'widget.html'));
  widgetWin.webContents.on('did-finish-load', () => {
    if (lastStats) widgetWin.webContents.send('stats', lastStats);
  });
  widgetWin.on('moved', () => {
    if (!widgetWin || widgetWin.isDestroyed()) return;
    const [x, y] = widgetWin.getPosition();
    saveState({ x, y });
  });
  widgetWin.on('closed', () => { widgetWin = null; });
}

function toggleWidget() {
  if (widgetWin && !widgetWin.isDestroyed()) {
    if (widgetWin.isVisible()) { widgetWin.hide(); saveState({ visible: false }); }
    else {
      widgetWin.show();
      saveState({ visible: true });
      if (lastStats) widgetWin.webContents.send('stats', lastStats);
    }
  } else {
    createWidget();
    saveState({ visible: true });
  }
  updateTray();
}

function showApp() {
  if (win && !win.isDestroyed()) { win.show(); win.focus(); }
  else createWindow();
}

function openQuickAdd() {
  if (quickWin && !quickWin.isDestroyed()) { quickWin.show(); quickWin.focus(); return; }
  const { workArea } = screen.getPrimaryDisplay();
  quickWin = new BrowserWindow({
    width: 260,
    height: 168,
    x: workArea.x + workArea.width - 280,
    y: workArea.y + 20,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'quickadd-preload.js'),
    },
  });
  quickWin.loadFile(path.join(__dirname, 'quickadd.html'));
  quickWin.webContents.on('did-finish-load', () => {
    quickWin.webContents.send('accounts', (lastStats && lastStats.accountsMin) || []);
  });
  quickWin.on('closed', () => { quickWin = null; });
}

function updateTray() {
  if (!tray) return;
  if (lastStats) {
    let title = ' ' + fmt(lastStats.totBal || 0);
    if (lastStats.winReady) title += ' · ✓';
    else if (lastStats.winProgress) title += ' · ' + lastStats.winProgress;
    if (lastStats.today) title += '  ' + (lastStats.today > 0 ? '▲' : '▼') + fmt(Math.abs(lastStats.today));
    tray.setTitle(title, { fontType: 'monospacedDigit' });
  } else {
    tray.setTitle(' Patience');
  }
  const widgetVisible = widgetWin && !widgetWin.isDestroyed() && widgetWin.isVisible();
  const items = [
    { label: 'Open Patience Flow', click: () => showApp() },
    { label: 'Quick Add Trading Day…', click: () => openQuickAdd() },
    { type: 'separator' },
  ];
  if (lastStats && lastStats.lines && lastStats.lines.length) {
    lastStats.lines.slice(0, 8).forEach((l) => {
      items.push({ label: l.name + ' — ' + l.status, enabled: false });
    });
    items.push({ type: 'separator' });
    items.push({ label: 'P&L this period: ' + fmtS(lastStats.period || 0), enabled: false });
    items.push({ label: 'Today: ' + fmtS(lastStats.today || 0), enabled: false });
    items.push({ type: 'separator' });
  }
  items.push({ label: (widgetVisible ? 'Hide' : 'Show') + ' Mini Widget', click: () => toggleWidget() });
  items.push({
    label: 'Start at Login',
    type: 'checkbox',
    checked: app.getLoginItemSettings().openAtLogin,
    click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
  });
  items.push({ type: 'separator' });
  const hasBackup = fs.existsSync(backupFile());
  items.push({ label: 'Reveal Auto-Backup File', enabled: hasBackup, click: () => { if (hasBackup) shell.showItemInFolder(backupFile()); } });
  items.push({ label: 'Restore from Auto-Backup', enabled: hasBackup, click: () => restoreFromBackup() });
  items.push({ type: 'separator' });
  items.push({ label: 'Quit Patience Flow', click: () => app.quit() });
  tray.setContextMenu(Menu.buildFromTemplate(items));
}

function restoreFromBackup() {
  if (!win || win.isDestroyed()) { createWindow(); }
  let json = '';
  try { json = fs.readFileSync(backupFile(), 'utf8'); } catch (e) {}
  if (json && win && !win.isDestroyed()) {
    showApp();
    win.webContents.send('restore-backup', json);
  }
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'tray.png'));
  tray = new Tray(icon);
  tray.setToolTip('Patience Flow');
  updateTray();
}

ipcMain.on('stats', (_e, stats) => {
  lastStats = stats;
  updateTray();
  if (widgetWin && !widgetWin.isDestroyed()) {
    const [w, h] = widgetWin.getSize();
    const target = widgetHeight();
    if (h !== target) widgetWin.setSize(240, target);
    widgetWin.webContents.send('stats', stats);
  }
  if (quickWin && !quickWin.isDestroyed()) quickWin.webContents.send('accounts', stats.accountsMin || []);
});
ipcMain.on('open-app', () => showApp());
ipcMain.on('hide-widget', () => { if (widgetWin && !widgetWin.isDestroyed()) { widgetWin.hide(); saveState({ visible: false }); updateTray(); } });
ipcMain.on('quick-add-submit', (_e, d) => {
  if (win && !win.isDestroyed()) win.webContents.send('quick-add', d);
  if (quickWin && !quickWin.isDestroyed()) quickWin.close();
});
ipcMain.on('quick-add-close', () => { if (quickWin && !quickWin.isDestroyed()) quickWin.close(); });
ipcMain.on('backup', (_e, json) => {
  try { fs.writeFileSync(backupFile(), json); } catch (e) {}
});

app.whenReady().then(() => {
  createWindow();
  createTray();
  if (loadState().visible !== false) createWidget();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else showApp();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

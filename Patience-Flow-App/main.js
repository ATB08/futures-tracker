const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

let win = null, widgetWin = null, quickWin = null, tray = null, lastStats = null;
const stateFile = () => path.join(app.getPath('userData'), 'widget-state.json');
const backupFile = () => path.join(app.getPath('userData'), 'Patience-Flow-Backup.json');
const preSyncBackupFile = () => path.join(app.getPath('userData'), 'Patience-Flow-PreSync-Backup.json');

/* ── iCloud sync (shared between this user's Macs via the same Apple ID) ── */
const icloudRoot = () => path.join(os.homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs');
const icloudDir = () => path.join(icloudRoot(), 'Claude Code', 'Patience-Flow');
const oldIcloudDir = () => path.join(icloudRoot(), 'Patience-Flow'); // pre-2026-08-23 location
const icloudDataFile = () => path.join(icloudDir(), 'data', 'Patience-Flow-Data.json');
const icloudHtmlFile = () => path.join(icloudDir(), 'app', 'Patience-Flow.html');

// One-time move of the sync folder from the old top-level location into the
// "Claude Code" folder. Self-healing: runs on every Mac at startup.
function migrateIcloudFolder() {
  try {
    const oldD = oldIcloudDir(), newD = icloudDir();
    if (!fs.existsSync(oldD)) return;
    ensureDir(path.dirname(newD));
    const oldData = path.join(oldD, 'data', 'Patience-Flow-Data.json');
    const newData = path.join(newD, 'data', 'Patience-Flow-Data.json');
    if (fs.existsSync(oldData) && !fs.existsSync(newData)) {
      // copy old → new (data + app), preserving the newest content
      const cp = (rel) => {
        const s = path.join(oldD, rel), d = path.join(newD, rel);
        if (fs.existsSync(s)) { ensureDir(path.dirname(d)); try { fs.copyFileSync(s, d); const m = fs.statSync(s).mtime; fs.utimesSync(d, m, m); } catch (e) {} }
      };
      cp(path.join('data', 'Patience-Flow-Data.json'));
      cp(path.join('app', 'Patience-Flow.html'));
    }
    // remove the old folder once the new one holds the data
    if (fs.existsSync(newData)) { try { fs.rmSync(oldD, { recursive: true, force: true }); } catch (e) {} }
  } catch (e) {}
}
const htmlWorkFile = () => path.join(app.getPath('userData'), 'app', 'Patience-Flow.html');
const bundledHtml = () => path.join(__dirname, 'Patience-Flow.html');

function ensureDir(p) { try { fs.mkdirSync(p, { recursive: true }); } catch (e) {} }
function mtimeOf(p) { try { return fs.statSync(p).mtimeMs; } catch (e) { return 0; } }

/* Resolve which app HTML to load, keeping a stable work-copy path (so localStorage
   is never orphaned) and converging the newest version between bundle and iCloud. */
function resolveAppHtml() {
  const bundled = bundledHtml(), work = htmlWorkFile(), cloud = icloudHtmlFile();
  ensureDir(path.dirname(work));
  const mB = mtimeOf(bundled), mW = mtimeOf(work), mC = mtimeOf(cloud);
  // newest source among bundled (this install) and iCloud (pushed from another Mac)
  let src = bundled, srcM = mB;
  if (mC > srcM) { src = cloud; srcM = mC; }
  if (srcM > 0 && (mW === 0 || mW < srcM)) {
    try { fs.copyFileSync(src, work); const t = new Date(srcM); fs.utimesSync(work, t, t); } catch (e) {}
  }
  // publish our (possibly newer) version to iCloud so the other Mac picks it up
  const mWnow = mtimeOf(work);
  if (mWnow > 0 && mWnow > mtimeOf(cloud)) {
    try { ensureDir(path.dirname(cloud)); fs.copyFileSync(work, cloud); const t = new Date(mWnow); fs.utimesSync(cloud, t, t); } catch (e) {}
  }
  return fs.existsSync(work) ? work : bundled;
}

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

  win.loadFile(resolveAppHtml());
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
        { label: 'Open iCloud Sync Folder', click: () => { ensureDir(icloudDir()); shell.openPath(icloudDir()); } },
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
    const multi = (lastStats.fundedCount || 0) > 1;
    let title = ' ' + fmt(lastStats.totBal || 0);
    if (multi) {
      // Aggregate view: total balance, ready count, today's total — no ambiguous single-account progress
      if (lastStats.readyCount > 0) title += ' · ' + lastStats.readyCount + '✓';
    } else {
      if (lastStats.winReady) title += ' · ✓';
      else if (lastStats.winProgress) title += ' · ' + lastStats.winProgress;
    }
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
    lastStats.lines.slice(0, 12).forEach((l) => {
      const bal = typeof l.bal === 'number' ? '   ' + fmt(l.bal) : '';
      const tdy = l.today ? '   ' + (l.today > 0 ? '▲' : '▼') + fmt(Math.abs(l.today)) : '';
      const item = { label: l.name + bal + tdy, enabled: false };
      const sub = [{ label: l.status, enabled: false }];
      item.submenu = sub;
      item.enabled = true;
      items.push(item);
    });
    items.push({ type: 'separator' });
    items.push({ label: 'Total balance: ' + fmt(lastStats.totBal || 0), enabled: false });
    items.push({ label: 'P&L this period: ' + fmtS(lastStats.period || 0), enabled: false });
    items.push({ label: 'Today (all accounts): ' + fmtS(lastStats.today || 0), enabled: false });
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
  // mirror to the shared iCloud data file so the other Mac stays in sync
  try { ensureDir(path.dirname(icloudDataFile())); fs.writeFileSync(icloudDataFile(), json); } catch (e) {}
});
ipcMain.on('safety-backup', (_e, json) => {
  try { fs.writeFileSync(preSyncBackupFile(), json); } catch (e) {}
});
ipcMain.handle('get-sync-data', () => {
  const read = (p) => { try { const o = JSON.parse(fs.readFileSync(p, 'utf8')); if (o && o.data) return { exported: o.exported || '', data: o.data }; } catch (e) {} return null; };
  return { cloud: read(icloudDataFile()), local: read(backupFile()) };
});

// Only ever allow ONE Patience-Flow running at a time (across all copies),
// otherwise multiple instances stomp on the same localStorage / iCloud file.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showApp());
  app.whenReady().then(() => {
    migrateIcloudFolder();
    createWindow();
    createTray();
    if (loadState().visible !== false) createWidget();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else showApp();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

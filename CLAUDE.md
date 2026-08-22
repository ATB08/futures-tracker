# Patience-Flow — Projektkontext für Claude

Prop-Firm-Futures-Tracker für ATB08 (Einzelnutzer). Single-File-App plus macOS-Desktop-Hülle. Repo: `ATB08/futures-tracker`.

## Mit dem Nutzer arbeiten
- **Immer auf Deutsch antworten.** Der Nutzer ist Programmier-Anfänger und Prop-Trader (Lucid „LUCIDPRO 50K"-Konto, handelt NQ über TradingView→Tradovate).
- Erkläre **was eine Funktion tut**, nicht wie sie programmiert ist. Keine Code-Details.
- Git/GitHub-Schritte explizit durchgehen. Der Nutzer merged PRs selbst.
- Der Nutzer schreibt lange Nachrichten mit mehreren Wünschen auf einmal — nummeriere sie zurück und setze alle um.
- **Nicht mögen:** Emojis in der UI (stattdessen Tabler-Icons; Konfetti-Animation darf bleiben), native Browser-Popups (stattdessen eigene dunkle Modals), Gold-/Amber-Akzente (blau bevorzugt), automatisch getrackte Daten die er nicht eingegeben hat.

## Dateien
- `Patience-Flow.html` — die komplette App (HTML+CSS+JS in einer Datei, kein Build, localStorage `af_*`, Chart.js, eingebetteter Tabler-Icon-Font).
- `Patience-Flow-App/` — Electron-Hülle (main.js = Tray/Menüleiste + Mini-Widget + Quick-Add + Auto-Backup; preload/widget/quickadd; icon.icns + tray.png). `node_modules` und `dist` sind gitignored.

## App bauen & ausliefern (macOS)
Nach Änderung an `Patience-Flow.html`:
```
osascript -e 'tell application "Patience-Flow" to quit' 2>/dev/null
cp Patience-Flow.html Patience-Flow-App/
cd Patience-Flow-App && npm run build
ditto dist/Patience-Flow-darwin-arm64/Patience-Flow.app /Applications/Patience-Flow.app
open /Applications/Patience-Flow.app
```
**WICHTIG:** `npm run build` signiert die App ad-hoc (`codesign --sign -`) + entfernt Quarantäne-Attribute. Ohne das blockiert macOS die App als „Malware blockiert" und verschiebt sie heimlich in den Papierkorb. Kanonischer Ort ist immer **/Applications/Patience-Flow.app** — nie aus `dist` starten lassen. Electron-Datenordner: `~/Library/Application Support/patience-flow/` (widget-state.json, Patience-Flow-Backup.json, Patience-Flow-PreSync-Backup.json).

## iCloud-Sync zwischen den zwei Macs des Nutzers (MacBook + iMac)
Ordner `~/Library/Mobile Documents/com~apple~CloudDocs/Patience-Flow/` mit `data/Patience-Flow-Data.json` (gemeinsamer Datenstand, Backup-Format `{app,exported,data:{af_*}}`) und `app/Patience-Flow.html` (neueste App-Version).
- **Daten-Sync:** `main.js` spiegelt jedes Auto-Backup zusätzlich in die iCloud-Datei. Beim Start gleicht die App ab (`cloudSyncStartup()` im Renderer über `getSyncData`): neuerer `exported`-Zeitstempel gewinnt; vor dem Übernehmen von Cloud-Daten schreibt sie eine Sicherheitskopie (`safety-backup` → PreSync-Backup). Per-Maschine-Marker `pf_syncStamp` in localStorage (KEIN `af_`-Prefix, also nicht Teil des Backups). Leeres localStorage (Neuinstallation/Origin-Wechsel) → Recovery aus Cloud oder lokalem Auto-Backup. Import/Restore setzen `pf_syncStamp` auf jetzt, damit die bewusste Aktion gewinnt.
- **App-Update-Sync:** `resolveAppHtml()` lädt die HTML aus einer stabilen Arbeitskopie `userData/app/Patience-Flow.html` (damit localStorage/Origin nie wechselt) und gleicht bundled↔iCloud per mtime ab („neuere gewinnt"). Neue HTML nach dem Build → beim Öffnen automatisch nach iCloud gepusht → anderer Mac zieht sie beim nächsten Start. **Nur reine HTML-Änderungen propagieren automatisch; ändert sich `main.js`/`preload.js` (die Hülle), muss die neu gebaute .app einmalig per AirDrop auf den iMac.** iCloud-Sync greift nur in der Electron-App (Browser/`file://` hat keinen `patienceDesktop`-Bridge).

## Testen
- JS prüfen: `<script>`-Block extrahieren, `node --check`.
- Im Browser-Pane testen: `localStorage` mit `af_accs`/`af_entries`/`af_trades`/`af_notes`/`af_accgroups` seeden + `migrateData()`. Der Pane rendert file:// als statische Snapshots — nach Bash/Python-Edits per `navigate` neu laden (nur Edit-Tool-Writes laden automatisch). **Nach dem Testen immer `localStorage.clear()`.**
- Icon-Font ist ein eingebetteter ~17KB Tabler-Subset; bei neuen `ti-*`-Icons muss der Subset neu erzeugt werden (fonttools, GSUB droppen).

## Datenmodell (Kurz)
Account: `{id,name,size(=Start-Balance),status:'eval'|'funded'|'live',dailyEntries[{date,pnl,symbol?}],archivedEntries[{...,stage}],payouts[],archivedPayouts[{...,stage}],lossLimit,evalLossLimit,dll,payoutBuffer,profitSplit,winDays,livePayoutGoal,liveDate,liveReceivedDate,groups[]}`. Stufenwechsel (goLive/passToFunded) archiviert die alte Historie statt sie zu löschen. Payout-Approve schreibt vollen Betrag in `payouts`, aber nur den Split-%-Anteil in die globalen `entries`. Insights/Heatmap sind stufenbewusst (Eintrag gehört zur Stufe per Account-Status bzw. `stage`-Tag).

**Konto-Archiv:** Ganze Konten (z.B. geblowte) können archiviert werden — sie wandern aus `accounts` in ein separates globales Array `archivedAccounts` (localStorage `af_archaccs`), damit sie automatisch aus allen `accounts`-Aggregationen/Statistiken fallen. Der Papierkorb-Knopf auf einer Konto-Karte öffnet einen 3-Wege-Dialog (Archive / Delete permanently / Cancel) via `uiDialog({buttons:[...]})`. Filter-Chip „Archived (n)" (nur wenn vorhanden) → `renderArchivedAccounts()` mit Wiederherstellen (`restoreAccount`) und endgültig Löschen (`purgeAccount`). Archivierte Konten tragen `archived:true` + `archivedAt`.

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
**WICHTIG:** `npm run build` signiert die App ad-hoc (`codesign --sign -`) + entfernt Quarantäne-Attribute. Ohne das blockiert macOS die App als „Malware blockiert" und verschiebt sie heimlich in den Papierkorb. Kanonischer Ort ist immer **/Applications/Patience-Flow.app** — nie aus `dist` starten lassen. Electron-Datenordner: `~/Library/Application Support/patience-flow/` (widget-state.json, Patience-Flow-Backup.json).

## Testen
- JS prüfen: `<script>`-Block extrahieren, `node --check`.
- Im Browser-Pane testen: `localStorage` mit `af_accs`/`af_entries`/`af_trades`/`af_notes`/`af_accgroups` seeden + `migrateData()`. Der Pane rendert file:// als statische Snapshots — nach Bash/Python-Edits per `navigate` neu laden (nur Edit-Tool-Writes laden automatisch). **Nach dem Testen immer `localStorage.clear()`.**
- Icon-Font ist ein eingebetteter ~17KB Tabler-Subset; bei neuen `ti-*`-Icons muss der Subset neu erzeugt werden (fonttools, GSUB droppen).

## Datenmodell (Kurz)
Account: `{id,name,size(=Start-Balance),status:'eval'|'funded'|'live',dailyEntries[{date,pnl,symbol?}],archivedEntries[{...,stage}],payouts[],archivedPayouts[{...,stage}],lossLimit,evalLossLimit,dll,payoutBuffer,profitSplit,winDays,livePayoutGoal,liveDate,liveReceivedDate,groups[]}`. Stufenwechsel (goLive/passToFunded) archiviert die alte Historie statt sie zu löschen. Payout-Approve schreibt vollen Betrag in `payouts`, aber nur den Split-%-Anteil in die globalen `entries`. Insights/Heatmap sind stufenbewusst (Eintrag gehört zur Stufe per Account-Status bzw. `stage`-Tag).

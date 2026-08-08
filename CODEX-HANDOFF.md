# Schinkenwurst Kartenlager – Übergabe für Codex

## Zweck

Persönliche, mobil- und desktopfähige Warenwirtschaft für Pokémon-Karten. Später erweiterbar um One Piece und Magic. Die Anwendung verwaltet Kartenbestand, Ein- und Verkäufe, Kosten, Versand, Plattformgebühren, Auswertungen und Exporte.

## Arbeitsweise zwischen Geräten

- Gemeinsamer Entwicklungszweig: `development`
- Produktionszweig: `main`
- Vor Arbeitsbeginn immer `development` abrufen (`Fetch`/`Pull`).
- Nach abgeschlossener Arbeit Änderungen nach `development` übertragen (`Commit`/`Push`).
- Niemals gleichzeitig auf Windows und Mac Änderungen vornehmen.
- Erst eine geprüfte Version wird gesammelt nach `main` übernommen.
- Cloudflare veröffentlicht nur `main`; automatische Branch-Vorschauen sind deaktiviert.

## Dienste

- GitHub: `Sch1nkenwurst/Card-Collector-data`
- Produktion: `https://cardcollectorapp.pages.dev/`
- Supabase-Projekt: `zgobgqfgvcsfvftzfmxk`
- Keine Zugangsdaten oder geheimen Schlüssel in diese Datei eintragen.

## Aktueller lokaler Stand

- Sichtbare Marke: **Schinkenwurst · Kartenlager**
- Lokale Version: `0.10.0`
- Responsive Gestaltung für Desktop und Mobil, geprüft bei 390 px Breite
- Testmodus und Live-Modus sind in Supabase getrennt
- Live-Bestand und Live-Vorgänge wurden am 8. August 2026 auf null zurückgesetzt
- Cardmarket-CSV-Import und Kennungen wie `OBF 207`
- Mengen-/Set-Erfassung und Mehrkartenverkauf
- Gebühren und Versandkosten getrennt
- CSV-, Cardmarket- und JSON-Export
- Atomare Supabase-Funktionen für Einkaufs- und Verkaufsstorno installiert:
  - `void_purchase_transaction`
  - `void_sale_transaction`

## Wichtige Architekturentscheidung

Bestand und Finanzen dürfen getrennte Fachbereiche sein, müssen aber durch atomare Datenbanktransaktionen gemeinsam aktualisiert werden. Bei einem Fehler wird der vollständige Geschäftsfall zurückgerollt. Direkte, nicht protokollierte Mengenänderungen sollen langfristig entfallen.

## Priorisierte nächste Ausbaustufe

1. Belegkopf für Einkauf/Verkauf und mehrere Kartenpositionen je Beleg
2. Unveränderbares Bestandsbewegungsbuch
3. Storno als verknüpfte Gegenbuchung
4. Einstandskosten und Rohgewinn über eine festgelegte Methode (zunächst gleitender Durchschnitt oder FIFO)
5. Retouren, Teilrückerstattungen und Lieferantenrückgaben
6. Inventur, Umlagerung und Lagerplatzhistorie
7. Sichere JSON-Wiederherstellung mit Vorschau und atomarem Import
8. Audit-Protokoll und interne Vorgangsnummern

## Lokaler Start

- Windows: `LOKAL-STARTEN.cmd`
- Adresse: `http://localhost:4173`
- Mac-Startdatei muss noch ergänzt werden.

## Hinweise für eine neue Codex-Aufgabe

1. Diese Datei und `PROJEKTSTATUS.md` vollständig lesen.
2. Prüfen, dass der lokale Checkout auf `development` steht und aktuell ist.
3. Keine Veröffentlichung nach `main`, GitHub oder Cloudflare ohne ausdrückliche Freigabe.
4. Änderungen zunächst lokal testen und anschließend auf Desktop- und Mobilbreite prüfen.
5. Der Nutzer ist technischer Laie; Erklärungen kurz, konkret und schrittweise formulieren.


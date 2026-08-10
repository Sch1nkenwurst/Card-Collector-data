# Schinkenwurst Kartenlager – Projektchronik

Diese Datei dokumentiert die Entwicklung und die Gründe hinter wichtigen Entscheidungen. Bei Widersprüchen gelten der aktuelle Code, `CODEX-HANDOFF.md` und `PROJEKTSTATUS.md` vor älteren Chronikpunkten.

## 1. Ursprüngliche Idee

Das Projekt begann als mobile Website zum Scannen und automatischen Erkennen von Pokémon-Karten. Die Kamera sollte Karte, Set, Nummer und Sprache erkennen, möglichst einen Cardmarket-bezogenen Preis bestimmen und anschließend Excel-/CSV- sowie Cardmarket-kompatible Daten liefern.

Mehrere Scanner-Versionen wurden auf Smartphones getestet. Die Erkennungsqualität war zu unzuverlässig: Karten wurden häufig gar nicht oder falsch erkannt. Setcodes und Kartennummern wie `OBF 207` oder `CRI ...` sollten die Erkennung verbessern. TCGdex wurde als Kartenquelle verwendet und später um Setcode-Zuordnungen sowie eine mögliche zweite Datenquelle ergänzt.

## 2. Strategiewechsel zur Warenwirtschaft

Der Nutzer sammelt und handelt Karten, verkauft regelmäßig über Cardmarket und besitzt Booster-Karten, Einzelkäufe und große unsortierte Sammlungen. Deshalb wurde die Scanner-Idee zurückgestellt. Das zentrale Produktziel ist seitdem eine persönliche Karten-Warenwirtschaft:

- digitaler Kartenbestand und Lagerorte
- Ein- und Verkäufe
- Plattformgebühren und Versand
- Umsatz, Kosten und Ergebnis
- Cardmarket-Import und -Export
- mobile und Desktop-Nutzung
- später Pokémon, One Piece und Magic

Die Anwendung ist ein Management- und Warenwirtschaftswerkzeug. Sie ist keine zertifizierte Finanzbuchhaltung und ersetzt keine Steuerberatung.

## 3. Technischer Aufbau

- Statische Website aus HTML, CSS und JavaScript
- Supabase für Anmeldung und Cloud-Datenbank
- GitHub-Repository `Sch1nkenwurst/Card-Collector-data`
- Cloudflare Pages als Hosting unter `https://cardcollectorapp.pages.dev/`
- Produktionsbranch `main`
- Entwicklungsbranch `development`
- Cloudflare veröffentlicht nur `main`; automatische Branch-Vorschauen sind deaktiviert

Netlify wurde zuvor verwendet. Wegen des Credit-Verbrauchs erfolgte der Wechsel zu Cloudflare Pages. Alte Netlify-Adressen und Konfigurationen können noch als historische Überreste existieren, sind aber nicht die Zielplattform.

## 4. Bestehende Fachfunktionen

- Bestand mit Spiel, Sprache, Name, Set, Kartennummer, Zustand, Variante, Menge, Lagerort und Preisen
- Einzelkartenerfassung
- Mengen-/Set-Erfassung
- Cardmarket-Einkaufsimport aus `ArticlesFromShipment...csv`
- Auflösung unbekannter Cardmarket-Produkte über Eingaben wie `OBF 207`
- Setcode-Zuordnungen über TCGdex und ergänzende Quellen
- Mehrkartenverkauf mit Bestandssuche
- Plattformgebühren sowie erhaltenes und tatsächlich gezahltes Porto als getrennte Werte
- externe Referenzen wie Cardmarket-Bestell- oder Versandnummern
- Vorgänge, Dashboard und Monatsauswertung
- Bestands-, Vorgangs-, Cardmarket- und JSON-Export
- getrennter Test- und Live-Modus über `is_test`

## 5. Wichtige Fehler aus früheren Versionen

### Scanner

Die Bilderkennung war zu unzuverlässig und ist nicht mehr der priorisierte Kernprozess.

### Zu schnelle Kartenkennung

Kennungen wurden bereits während einer kurzen Eingabepause übernommen. Die Wartezeit wurde verlängert und Enter als bewusste Bestätigung unterstützt.

### Setcodes

`OBF 207` funktionierte zeitweise nur über eine Sonderbehandlung. Die Lösung sollte allgemein für auf Karten aufgedruckte Setcodes funktionieren und zentrale Zuordnungen speichern.

### Doppelte Cardmarket-Importe

Importdateien werden über einen Hash erkannt. Ein vollständig stornierter Import darf später erneut importiert werden; aktive Dubletten sollen verhindert werden.

### Verkäufe mit mehreren Karten

Der ursprüngliche Verkaufsdialog konnte nur eine Karte auswählen. Er wurde durch einen Mehrkartenverkauf mit Suche und Mengen ersetzt.

### Stornierungen

Frühere Einkaufsstornos veränderten nur die Finanzen, nicht zuverlässig den Bestand. Verkaufsstornos konnten Bestand und Vorgang in getrennten Schritten ändern. Dadurch bestand das Risiko auseinanderlaufender Daten.

### Falsche Berichtssumme

Stornierte Einkäufe wurden in einer Berichtssumme weiterhin als Kosten gezählt. Die aktuelle Auswertung schließt stornierte Vorgänge aus.

## 6. Aktuelle Buchungsentscheidung

Bestand und Finanzen sind professionelle getrennte Fachbereiche, dürfen aber nicht unabhängig gespeichert werden. Ein Geschäftsfall muss atomar verarbeitet werden: Entweder werden alle zugehörigen Änderungen gespeichert oder keine.

In Supabase wurden diese Funktionen installiert:

- `void_purchase_transaction`
- `void_sale_transaction`

Ein Einkauf kann nicht storniert werden, wenn die dazugehörige Menge nicht mehr vollständig im Bestand vorhanden ist. Ein Verkaufsstorno stellt alle Positionen des Verkaufs gemeinsam wieder her.

Die heutige Struktur aus `inventory_items` und `transactions` ist noch eine Zwischenstufe. Das professionelle Zielmodell benötigt Belegköpfe, Belegpositionen und ein unveränderbares Bestandsbewegungsbuch.

## 7. Datenbereinigung

Am 8. August 2026 wurden auf ausdrücklichen Wunsch alle damaligen Live-Vorgänge und Live-Bestandskarten zurückgesetzt. Vorher wurde lokal eine Rückfallsicherung erzeugt. Testdaten, Benutzerkonto, Setzuordnungen und Datenbankfunktionen blieben erhalten.

## 8. Frontend und Marke

Der generische Name „Card Collector“ wurde verworfen, weil er nicht die persönliche Marke des Nutzers darstellt. Die sichtbare Marke lautet:

**Schinkenwurst · Kartenlager**

Lokale Version: `0.10.0`

Die Oberfläche verwendet eine bordeauxrote und cremefarbene Gestaltung, das Kürzel `SW`, einen vereinfachten Schnellstart und verständlichere Beschriftungen. „Gewinn“ wurde teilweise bewusst zu „Ergebnis“ geändert, weil die aktuelle Berechnung noch keine vollständige buchhalterische Gewinnermittlung darstellt.

Die Oberfläche wurde auf Desktop und bei ungefähr 390 px Breite geprüft.

## 9. Geräteübergreifende Entwicklung

Eine lokale Codex-Aufgabe auf Windows wird nicht zuverlässig als identische lokale Aufgabe auf dem Mac angezeigt. Deshalb arbeiten Windows- und Mac-Codex mit getrennten Aufgaben, aber identischem Projektwissen aus dem Repository.

Verbindlicher Ablauf:

1. Nur ein Gerät arbeitet gleichzeitig.
2. Vor Beginn `development` mit Fetch/Pull aktualisieren.
3. Nach der Arbeit geprüfte Änderungen committen und pushen.
4. Das andere Gerät führt anschließend Fetch/Pull aus.
5. Neue Codex-Aufgaben lesen zuerst die drei Projektdokumente.

## 10. Bekannter Übertragungsfehler

Beim ersten Übertragen der Version `0.10.0` wurden große Dateien wegen einer Ausgabegrenze abgeschnitten. Dadurch fehlten auf dem Mac Teile von `app.js` und `styles.css`. Die Dateien wurden anschließend blockweise vollständig erneut nach `development` übertragen und auf eindeutige Merkmale wie `applySchinkenwurstBranding` und Version `0.10.0` geprüft.

## 11. Nächste professionelle Ausbaustufe

1. Einkauf/Verkauf als Belegkopf mit mehreren Kartenpositionen
2. unveränderbares Bestandsbewegungsbuch
3. Storno als verknüpfte Gegenbuchung
4. Einstandskosten und Rohgewinn über gleitenden Durchschnitt oder FIFO
5. Retouren, Teilrückerstattungen und Lieferantenrückgaben
6. Inventur, Umlagerungen und Lagerplatzhistorie
7. sichere Backup-Wiederherstellung mit Vorschau und atomarem Import
8. Audit-Protokoll und interne Vorgangsnummern

## 12. Nicht als aktuell behandeln

- die alte Scanner-Priorität
- frühere Netlify-Workflows
- manuelles Hochladen von ZIP-Dateien als normaler Entwicklungsprozess
- der sichtbare Produktname „Card Collector“
- direkte Veröffentlichung jeder Zwischenänderung nach `main`
- einfache Löschung von Buchungen ohne Gegenbuchungs- oder Stornologik

## 13. Kartenbilder im Bestand

Am 8. August 2026 wurde die zuvor verlorengegangene Kartenbildanzeige wieder ergänzt. Neue Karten aus der Set-Schnellerfassung und dem Cardmarket-Import speichern die TCGdex-Karten-ID und eine TCGdex-Bildadresse. Bestehende Testkarten wurden ergänzt; Live-Bestand und Live-Vorgänge blieben unverändert bei null. Die Anzeige wurde auf Desktop und bei 390 px Breite geprüft.

## 14. Verkaufsauswahl und Marktpreise

Am 8. August 2026 wurde eine Mehrfachauswahl direkt im Bestand ergänzt. Die gewählten Karten werden in den Mehrkartenverkauf übernommen; der vollständige Verkauf wird mit `record_multi_sale` atomar gebucht. Die Verkaufsliste ist ohne Suchbegriff scrollbar, berücksichtigt kleine Tippfehler und begrenzt unzulässige Mengen. TCGdex liefert den Cardmarket-Trendpreis, der mit Zeitstand gespeichert und als unverbindlicher Marktpreis sowie als hypothetischer Bestandswert angezeigt wird. Fünf aktive Testpositionen wurden aktualisiert; Live-Bestand und Live-Vorgänge blieben bei null.

## 15. Technische Modernisierung auf Version 0.11.0

Am 10. August 2026 wurde die statische Laufzeit auf einen reproduzierbaren
Vite-Build mit fest versionierter Supabase-Bibliothek umgestellt. Geheimnisse
und Konfigurationen liegen nicht mehr in eingecheckten JavaScript-Dateien.
Automatische Tests prüfen Suche und Finanzauswertung. Cloudflare liefert eine
Content-Security-Policy und weitere Sicherheitsheader aus.

Supabase erhielt versionierte Migrationen, ein Bestandsbewegungsbuch und ein
Audit-Protokoll. Einzelbuchungen, vollständige Cardmarket-Importe und
Bestandskorrekturen werden nun atomar ausgeführt. Direkte Löschungen sind nur
noch für eigene Testdaten erlaubt; zentrale Set-Zuordnungen sind für den
Browser schreibgeschützt. Vor und nach der Migration blieben Live-Bestand und
Live-Vorgänge bei null.



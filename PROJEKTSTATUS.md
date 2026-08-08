# Card Collector – lokaler Projektstand

## Bereits vorhanden

- Anmeldung und getrennte Live-/Testdaten über Supabase
- Bestand, Einzel- und Set-Schnellerfassung
- Cardmarket-Einkaufsimport mit Kartenkennung wie `OBF 207`
- Mehrpositionsverkauf mit Suche, Gebühren, Porto und externer Referenz
- Vorgangsliste, Stornierung, Dashboard und Monatsauswertung
- CSV-, Cardmarket- und vollständiger JSON-Export
- Cloudflare Pages ist mit GitHub verbunden; lokale Änderungen veröffentlichen nichts

## In dieser lokalen Fassung korrigiert

- Stornierte Einkäufe werden in der Berichtssumme nicht mehr als Kosten gezählt.
- Einkaufsstornierungen buchen Bestand und Finanzvorgang gemeinsam zurück.
- Ein Einkauf kann nicht storniert werden, wenn seine Menge nicht mehr vollständig verfügbar ist.
- Verkaufsstornierungen stellen alle Positionen eines Verkaufs gemeinsam wieder her.
- Die Stornierungen laufen atomar in Supabase: vollständig oder gar nicht.
- Der Vorgangs-CSV enthält nun Porto, Versandkosten, Referenzen, Gruppen und Stornostatus.
- Die JSON-Sicherung enthält Format, Version, Modus, Konto, Bestand und Vorgänge.

## Kritische nächste Ausbaustufe

1. **Belegkopf und Positionen trennen**  
   Ein Einkauf oder Verkauf wird zu einem Vorgang mit mehreren Kartenpositionen. Gebühren, Porto, Kunde, Referenz und Status gehören an den Vorgang und nicht an eine beliebige Kartenzeile.

2. **Bestandsbewegungsbuch führen**  
   Jede Zu- oder Abbuchung erhält eine unveränderbare Bewegung. Der aktuelle Bestand wird daraus nachvollziehbar; direkte Mengenänderungen ohne Beleg werden abgeschafft.

3. **Einstandskosten und Rohgewinn richtig berechnen**  
   Einkaufsausgaben für noch vorhandene Karten sind Lagervermögen und nicht sofort Warenaufwand. Für Verkäufe wird eine festgelegte Methode benötigt, zunächst gleitender Durchschnitt oder FIFO.

4. **Storno durch Gegenbuchung**  
   Originale bleiben unverändert. Eine verknüpfte Gegenbuchung hebt sie auf. Abhängigkeiten werden geprüft: Einkauf erst nach Rückabwicklung nachfolgender Verkäufe stornierbar.

5. **Rückgaben und Erstattungen**  
   Getrennte Abläufe für Kundenretoure, Teilrückerstattung, verlorene Sendung, beschädigte Karte und Rückgabe an Lieferanten.

6. **Backup und Wiederherstellung**  
   JSON-Backup prüfen, Vorschau anzeigen und anschließend atomar in Test- oder Livebestand wiederherstellen. Ergänzend regelmäßige Supabase-Sicherung und dokumentierter Wiederherstellungstest.

7. **Inventur und Lagerorte**  
   Zähllisten, Soll-/Ist-Abweichungen, Umlagerungen, Historie pro Karte und eindeutige Lagerplatzstruktur.

8. **Auftragsstatus**  
   Entwurf, bezahlt, kommissioniert, versendet, abgeschlossen und storniert; dazu Käufer, Versandart und Sendungsnummer.

9. **Kontrollen und Protokoll**  
   Dublettenwarnungen, Pflichtfelder, fortlaufende interne Nummern und ein Audit-Protokoll aller Änderungen.

10. **Sicherheit**  
    Das gemeinsame Webseitenpasswort wird langfristig durch echte Benutzerkonten, starke Passwörter und optional Zwei-Faktor-Anmeldung ersetzt.

## Einordnung

Die Anwendung ist ein Warenwirtschafts- und Managementwerkzeug. Sie soll nachvollziehbare Zahlen liefern, ist aber ohne weitere rechtliche und technische Anforderungen keine zertifizierte Finanzbuchhaltung und ersetzt keine Steuerberatung.


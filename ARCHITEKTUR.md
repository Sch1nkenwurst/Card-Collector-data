# Architektur – Schinkenwurst Kartenlager

## Zielbild

Das Kartenlager ist eine persönliche Warenwirtschaft. Die Oberfläche läuft als
statische Vite-Anwendung auf Cloudflare Pages. Supabase übernimmt Anmeldung,
Datenhaltung, Zugriffsregeln und atomare Geschäftsfallfunktionen.

## Verantwortlichkeiten

- `public/index.html` und `public/styles.css`: Oberfläche und responsives Layout
- `public/app.js`: UI-Abläufe und Aufrufe der Datenbankfunktionen
- `public/domain.js`: reine, automatisch testbare Fachberechnungen
- `supabase/migrations/`: nachvollziehbare Datenbankänderungen
- `static/_headers`: Sicherheits- und Cache-Header für Cloudflare Pages

## Verbindliche Datenregeln

- Jeder Benutzer sieht ausschließlich seine eigenen Daten (RLS).
- Test- und Live-Daten tragen getrennte Moduskennzeichen.
- Bestand und Finanzvorgang werden bei Geschäftsfalländerungen atomar geändert.
- Live-Bestände und Live-Vorgänge können nicht direkt gelöscht werden.
- Mengenänderungen werden im Bestandsbewegungsbuch protokolliert.
- Änderungen an Bestand und Vorgängen werden im Audit-Protokoll festgehalten.
- Zentrale Set-Zuordnungen sind für Browser nur lesbar.

## Lokale Prüfung

1. `npm install`
2. Lokale Umgebungsvariablen anhand von `.env.example` setzen.
3. `npm run check` für Tests und Produktions-Build ausführen.
4. `npm run dev` starten und Desktop sowie 390-Pixel-Breite prüfen.

Lokale `.env`-Dateien, Pakete und das Build-Verzeichnis werden niemals in Git
gespeichert.

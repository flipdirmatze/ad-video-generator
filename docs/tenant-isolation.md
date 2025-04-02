# Mandantentrennung (Tenant Isolation) in S3

## Überblick

Die Mandantentrennung ist eine wichtige Sicherheitsmaßnahme, um sicherzustellen, dass Daten verschiedener Benutzer (Mandanten) strikt voneinander getrennt sind. In diesem Projekt wurde die Mandantentrennung für den AWS S3-Speicher implementiert, um die Datensicherheit und Datenschutzkonformität zu verbessern.

### Warum ist Mandantentrennung wichtig?

1. **Datenschutz und Compliance**: Stellt sicher, dass Benutzerdaten getrennt sind und nicht versehentlich miteinander geteilt werden.
2. **Berechtigungskontrolle**: Ermöglicht eine granulare Rechteverwaltung auf Benutzerebene.
3. **Sicherheit**: Reduziert das Risiko von unbeabsichtigtem Datenzugriff.
4. **Auditing und Logging**: Vereinfacht die Nachverfolgung von Datenzugriffen und -änderungen.

## Implementierung

### Neue S3-Pfadstruktur

Die neue Struktur verwendet Benutzer-IDs als Haupttrennungsebene:

```
s3://bucket/
  users/
    [userId]/
      uploads/   # Hochgeladene Benutzervideos
      processed/ # Verarbeitete Segmente
      final/     # Endgültige Videos
      audio/     # Audiodateien/Voiceovers
      config/    # Konfigurationsdateien
```

Statt der bisherigen Struktur:

```
s3://bucket/
  uploads/     # Alle hochgeladenen Videos
  processed/   # Alle verarbeiteten Segmente
  final/       # Alle endgültigen Videos
  audio/       # Alle Audiodateien
  config/      # Alle Konfigurationen
```

### Wesentliche Codeänderungen

1. **src/lib/storage.ts**:
   - Neue `generateUserScopedPath`-Funktion für konsistente Pfadgenerierung
   - Erweiterung aller Funktionen um `userId`-Parameter
   - Abwärtskompatibilität für Legacy-Pfade

2. **docker/scripts/process-video.js**:
   - Hilfsfunktionen für mandantengetrennte Pfade
   - Verbesserte S3-Download- und Upload-Logik mit Fallback-Mechanismen
   - Automatische Erkennung des korrekten Pfadformats

3. **API-Routen**:
   - Berücksichtigung der Benutzer-ID bei S3-Operationen
   - Anpassung von Pfadgenerierung und S3-URL-Erstellung

4. **Migration**:
   - Script `scripts/migrate-s3-structure.js` für die Migration bestehender Daten

## Verwendung des Migrationsskripts

Das Migrationsskript `scripts/migrate-s3-structure.js` hilft bei der Konvertierung bestehender Daten zur neuen Struktur.

### Voraussetzungen

- Node.js installiert
- AWS CLI konfiguriert mit ausreichenden Berechtigungen
- MongoDB-Verbindung konfiguriert in `.env`

### Ausführung

```bash
# Installation der Abhängigkeiten
npm install

# Simulationsmodus (keine tatsächlichen Änderungen)
node scripts/migrate-s3-structure.js --verbose

# Tatsächliche Migration (für alle Benutzer)
node scripts/migrate-s3-structure.js --dry-run false

# Migration für einen bestimmten Benutzer
node scripts/migrate-s3-structure.js --dry-run false --user <userId>

# Migration mit Löschen der Originaldateien
node scripts/migrate-s3-structure.js --dry-run false --keep-original false
```

### Funktionsweise

Das Skript führt folgende Aktionen aus:

1. Verbindet sich mit MongoDB
2. Identifiziert alle relevanten Dateien (Videos, Voiceovers, Projektdaten)
3. Kopiert diese Dateien in die neue Struktur
4. Aktualisiert die Datenbankeinträge
5. Optional: Löscht die Originaldateien

## Docker-Image aktualisieren

Nach der Implementierung der Mandantentrennung muss das Docker-Image für die Video-Verarbeitung aktualisiert werden.

### Container-Update

```bash
# Docker-Image neu bauen
docker build -t video-processor --platform linux/amd64 -f docker/Dockerfile .

# Bei AWS ECR anmelden
aws ecr get-login-password --region eu-central-1 | docker login --username AWS --password-stdin 585768181583.dkr.ecr.eu-central-1.amazonaws.com

# Image taggen
docker tag video-processor:latest 585768181583.dkr.ecr.eu-central-1.amazonaws.com/video-processor:latest

# Image hochladen
docker push 585768181583.dkr.ecr.eu-central-1.amazonaws.com/video-processor:latest
```

### Batch-Jobs aktualisieren

Stelle sicher, dass die AWS Batch Job-Definition aktualisiert wird, um mit dem neuen Image zu arbeiten:

1. Gehe zur AWS Batch-Konsole
2. Navigiere zu "Job-Definitionen"
3. Erstelle eine neue Revision der bestehenden Job-Definition
4. Aktualisiere den Image-Link
5. Stelle sicher, dass alle Umgebungsvariablen korrekt sind

## Abwärtskompatibilität

Die Implementierung wurde so gestaltet, dass sie abwärtskompatibel ist:

- Alte Pfade funktionieren weiterhin, aber werden künftig nicht mehr verwendet
- Fehlende Benutzer-ID führt zur Verwendung des alten (unsicheren) Pfadsystems
- Bei S3-Downloads werden automatisch mehrere Pfadvarianten ausprobiert

## Bekannte Einschränkungen

- Bestehende S3-Bucket-Richtlinien müssen ggf. angepasst werden
- Die Migration kann je nach Datenmenge Zeit in Anspruch nehmen
- IAM-Berechtigungen könnten verfeinert werden müssen 
import { LegalLayout, Section } from "./legal-layout";
import { LEGAL } from "./legal-config";

export function PrivacyPage() {
  return (
    <LegalLayout title="Datenschutzerklärung">
      <Section title="1. Verantwortlicher">
        <p>
          {LEGAL.name}
          {LEGAL.businessName && `, ${LEGAL.businessName}`}, {LEGAL.street}, {LEGAL.city}. E-Mail:{" "}
          {LEGAL.email}
        </p>
      </Section>

      <Section title="2. Was die App speichert">
        <p>Damit die App funktioniert, werden diese Daten in deinem Konto gespeichert:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Konto: E-Mail-Adresse und Passwort (nur als Hash). Bei Google- oder Apple-Login die von
            dort übermittelte E-Mail-Adresse.
          </li>
          <li>Profil: Name, Geburtsdatum, Größe, Tagesziele.</li>
          <li>Training: Pläne, Übungen, Sätze, Gewichte, Routinen, Statistiken.</li>
          <li>Ernährung: Mahlzeiten, Wasser, eigene Lebensmittel, Mikronährstoffe.</li>
          <li>Körperwerte: Gewichtsverlauf.</li>
          <li>
            Ausdauer: Aktivitäten mit Dauer, Strecke, Puls, Höhe, Kalorien, Name und der Strecke auf
            der Karte (GPS), aufgezeichnet in der App oder importiert von Strava. Dazu deine
            Ausdauer-Ziele.
          </li>
          <li>
            Garmin-Werte (Schlaf, Stress, Ruhepuls, Schritte, Body Battery, Sauerstoffsättigung):
            nur für Konten, bei denen die Synchronisierung eingerichtet wurde. Für die meisten
            Konten ist das derzeit nicht der Fall.
          </li>
          <li>Aufgaben, Wochenberichte und deine Einwilligungen (Version und Zeitpunkt).</li>
        </ul>
        <p>
          Training, Ernährung, Körper- und Pulswerte sind Gesundheitsdaten im Sinne von Art. 9
          DSGVO. Du gibst sie freiwillig ein.
        </p>
      </Section>

      <Section title="3. Rechtsgrundlagen">
        <ul className="list-disc space-y-1 pl-5">
          <li>Konto und Funktionen der App: Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO).</li>
          <li>
            Gesundheitsdaten: deine ausdrückliche Einwilligung (Art. 9 Abs. 2 lit. a DSGVO), die du
            nach der Anmeldung in der App erteilst und die mit Version und Zeitpunkt gespeichert
            wird. Du kannst sie jederzeit widerrufen, indem du dein Konto löschst.
          </li>
          <li>
            Optionale Funktionen (KI-Freitext, Strava): deine Einwilligung (Art. 6 Abs. 1 lit. a).
          </li>
          <li>
            Betrieb, Sicherheit, Missbrauchsschutz: berechtigtes Interesse (Art. 6 Abs. 1 lit. f).
          </li>
        </ul>
      </Section>

      <Section title="4. Empfänger und Drittländer">
        <p>Die App nutzt diese Dienstleister, die Daten in meinem Auftrag verarbeiten:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Supabase</strong> (Datenbank, Anmeldung, Serverfunktionen). Die Daten liegen in
            der EU (Region Irland). Der Anbieter gehört zu einem Unternehmen mit Sitz in den USA.
          </li>
          <li>
            <strong>GitHub Pages</strong> (Auslieferung der App, GitHub Inc., USA). Beim Aufruf
            verarbeitet GitHub technisch notwendige Daten wie deine IP-Adresse.
          </li>
          <li>
            <strong>Google</strong> oder <strong>Apple</strong>, wenn du dich damit anmeldest.
          </li>
          <li>
            <strong>CARTO und OpenStreetMap</strong> (Kartenkacheln, CARTO Group, USA). Wenn du eine
            Karte siehst, lädt dein Gerät die Kacheln direkt von dort. Dabei sehen sie deine
            IP-Adresse und die Kartenbereiche, die du ansiehst, also ungefähr deine Strecke.
          </li>
          <li>
            <strong>Anthropic</strong> (KI-Freitext, USA), <strong>Open Food Facts</strong>{" "}
            (Lebensmitteldaten, Frankreich) und <strong>Strava</strong> (USA), jeweils nur wenn du
            die Funktion nutzt, siehe Abschnitt 5.
          </li>
        </ul>
        <p>
          Bei Anbietern in den USA stützt sich die Übermittlung auf den EU-US-Datenschutzrahmen
          (Data Privacy Framework) oder Standardvertragsklauseln der EU.
        </p>
      </Section>

      <Section title="5. Optionale Funktionen">
        <p>
          <strong>KI-Freitext.</strong> Wenn du eine Mahlzeit als Text beschreibst und „Analysieren“
          wählst, wird genau dieser Text über meine Serverfunktion an Anthropic (USA) gesendet, das
          daraus Nährwerte schätzt. Das passiert nur nach deiner Zustimmung in der App und nur bei
          dieser Aktion. Du kannst die Zustimmung in den Einstellungen zurückziehen. Gib keine Namen
          oder Gesundheitsangaben über andere Personen ein.
        </p>
        <p>
          <strong>Lebensmittelsuche.</strong> Suchbegriffe und Barcodes werden über meine
          Serverfunktion an Open Food Facts (Frankreich) gesendet. Deine Identität wird nicht
          mitgeschickt.
        </p>
        <p>
          <strong>Barcode-Scanner.</strong> Das Kamerabild wird nur auf deinem Gerät ausgewertet und
          nicht hochgeladen.
        </p>
        <p>
          <strong>Standort.</strong> Für Läufe in der App wird dein Standort verwendet, solange die
          Aufzeichnung läuft, auch pausiert, bis du sie beendest. Die Strecke wird in deinem Konto
          gespeichert.
        </p>
        <p>
          <strong>Strava.</strong> Wenn du Strava verbindest, ruft die App deine Aktivitäten von
          Strava ab und speichert sie in deinem Konto. Das Zugriffstoken liegt nur auf dem Server.
          Du kannst die Verbindung in den Einstellungen trennen. Dabei versucht die App, den Zugriff
          bei Strava zu widerrufen. Du kannst ihn zusätzlich in deinen Strava-Einstellungen unter
          „Meine Apps“ entziehen.
        </p>
      </Section>

      <Section title="6. Speicherdauer und Löschung">
        <p>
          Deine Daten bleiben gespeichert, bis du dein Konto löschst. Das geht in der App unter
          Einstellungen, „Konto löschen“. Dann werden dein Konto und alle zugehörigen Daten
          endgültig gelöscht und die App versucht, den Zugriff bei Strava zu widerrufen.
          Datensicherungen des Anbieters werden nach dessen Fristen überschrieben.
        </p>
      </Section>

      <Section title="7. Lokale Speicherung im Gerät">
        <p>
          Die App speichert auf deinem Gerät deine Anmeldung, ein laufendes Training, zuletzt
          verwendete Lebensmittel sowie deine Zustimmung zur KI-Nutzung (Local Storage). Das ist für
          den Betrieb nötig. Es gibt keine Werbung, keine Tracker und keine Analysedienste.
        </p>
      </Section>

      <Section title="8. Deine Rechte">
        <p>
          Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung,
          Datenübertragbarkeit und Widerspruch (Art. 15 bis 21 DSGVO). Einen Export deiner Daten
          findest du unter Einstellungen, „Daten exportieren“. Bei Fragen schreib an {LEGAL.email}.
        </p>
        <p>
          Du kannst dich bei einer Datenschutzaufsichtsbehörde beschweren, zum Beispiel beim
          Hessischen Beauftragten für Datenschutz und Informationsfreiheit (datenschutz.hessen.de).
        </p>
      </Section>

      <Section title="9. Alter und Sicherheit">
        <p>
          Die App ist für Personen ab 16 Jahren gedacht. Die Verbindung ist verschlüsselt (HTTPS).
          Jeder Nutzer sieht in der Datenbank nur seine eigenen Daten.
        </p>
      </Section>

      <Section title="10. Änderungen">
        <p>
          Ich passe diese Erklärung an, wenn sich die App oder die Rechtslage ändert. Es gilt der
          Stand oben auf der Seite.
        </p>
      </Section>
    </LegalLayout>
  );
}

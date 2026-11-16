import { LegalLayout, Section } from "./legal-layout";

export function HealthNoticePage() {
  return (
    <LegalLayout title="Gesundheitshinweis">
      <Section title="Keine medizinische Beratung">
        <p>
          Diese App ist ein Hilfsmittel, um Training, Ernährung und Körperwerte festzuhalten. Sie
          ersetzt keine ärztliche Untersuchung, Diagnose, Behandlung oder Ernährungsberatung. Hole
          dir bei Vorerkrankungen, Schwangerschaft, Essstörungen oder wenn du unsicher bist
          ärztlichen Rat ein, bevor du Training oder Ernährung umstellst.
        </p>
      </Section>
      <Section title="Richtwerte, keine Vorgaben">
        <p>
          Kalorien-, Protein-, Kohlenhydrat- und Fettziele sowie alle daraus berechneten Werte sind
          grobe Richtwerte. Sie berücksichtigen deine individuelle Gesundheit nicht. Trage eigene
          Ziele ein, wenn dir ein Arzt oder eine Ernährungsfachkraft andere Werte empfohlen hat.
        </p>
      </Section>
      <Section title="Nährwertdaten können falsch sein">
        <p>
          Produktdaten stammen aus Open Food Facts, einer Datenbank, die von der Community gepflegt
          wird. Sie können unvollständig oder fehlerhaft sein. Verlasse dich bei Allergien oder
          Unverträglichkeiten nie auf die Angaben in der App, sondern lies die Verpackung.
        </p>
      </Section>
      <Section title="KI-Schätzungen">
        <p>
          Beim Freitext schätzt ein KI-Modell Mengen und Nährwerte. Die Ergebnisse sind Schätzungen
          und können deutlich danebenliegen. Prüfe sie, bevor du sie speicherst.
        </p>
      </Section>
      <Section title="Training auf eigene Verantwortung">
        <p>
          Sport kann zu Verletzungen führen. Trainiere nur, wenn du gesund bist, höre auf deinen
          Körper und brich bei Schmerzen, Schwindel oder Atemnot ab. Die App gibt keine
          Trainingsanweisungen vor. Pläne und Gewichte legst du selbst fest.
        </p>
      </Section>
      <Section title="Herzfrequenz und Messwerte">
        <p>
          Werte von Uhren und Sensoren (zum Beispiel Puls, Schlaf, Stress) sind keine
          Medizinprodukte und dienen nur der Orientierung.
        </p>
      </Section>
    </LegalLayout>
  );
}

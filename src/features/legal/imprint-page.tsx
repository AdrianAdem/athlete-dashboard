import { LegalLayout, Section } from "./legal-layout";
import { LEGAL } from "./legal-config";

export function ImprintPage() {
  return (
    <LegalLayout title="Impressum">
      <Section title="Angaben gemäß § 5 DDG">
        <p>
          {LEGAL.name}
          {LEGAL.businessName && (
            <>
              <br />
              {LEGAL.businessName}
            </>
          )}
          <br />
          {LEGAL.street}
          <br />
          {LEGAL.city}
        </p>
      </Section>
      <Section title="Kontakt">
        <p>E-Mail: {LEGAL.email}</p>
      </Section>
      <Section title="Verbraucherstreitbeilegung">
        <p>
          Ich bin nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer
          Verbraucherschlichtungsstelle teilzunehmen.
        </p>
      </Section>
      <Section title="Haftung für Inhalte und Links">
        <p>
          Die Inhalte der App wurden mit Sorgfalt erstellt. Für die Richtigkeit, Vollständigkeit und
          Aktualität, insbesondere der Nährwert- und Trainingsangaben, übernehme ich keine Gewähr.
          Näheres steht im Gesundheitshinweis. Für Inhalte externer Seiten, auf die verlinkt wird,
          sind deren Betreiber verantwortlich.
        </p>
      </Section>
    </LegalLayout>
  );
}

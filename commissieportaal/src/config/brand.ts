// Branding op één plek. Kleuren: #A03030, wit en zwart.
// Logo: zet het bestand in /public en vul het pad in (bv. "/logo.svg"). null = tekstlogo.
export const brand = {
  naam: "Gewoon Doen Marketing",
  appNaam: "Commissieportaal",
  logo: null as string | null,
  kleuren: {
    primair: "#A03030",
    primairDonker: "#7E2424",
    primairZacht: "#F6E9E9",
    wit: "#FFFFFF",
    zwart: "#000000",
    tekst: "#000000",
    tekstZacht: "#5C5C5C",
    rand: "#E3E3E3",
    achtergrond: "#FFFFFF",
    vlak: "#F7F7F7",
  },
  mailDomein: "gewoondoenmarketing.nl",
  /** Echte mailbox voor vragen en antwoorden. Het afzenderadres (MAIL_FROM) is alleen om te versturen. */
  contactEmail: "raphaelcornelis@gewoondoenmarketing.nl",
};

/** CSS-variabelen voor de hele app, afgeleid van de kleuren hierboven. */
export function brandCssVars(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(brand.kleuren).map(([k, v]) => [`--${k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())}`, v]),
  );
}

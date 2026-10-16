export const STATUS_LABEL = {
  te_controleren: "Moet gecontroleerd worden",
  goedgekeurd: "Goedgekeurd",
  vervangen: "Vervangen",
} as const;

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

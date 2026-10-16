import type { CommissionSettings } from "./commission";
import { DEFAULT_COMMISSION_SETTINGS } from "./commission";
import type { ColorClass, ParserOptions } from "./sheets/types";
import { DEFAULT_PARSER_OPTIONS } from "./sheets/types";

export interface AppSettings {
  commissie: CommissionSettings;
  parser: ParserOptions;
}

export const DEFAULT_SETTINGS: AppSettings = {
  commissie: DEFAULT_COMMISSION_SETTINGS,
  parser: DEFAULT_PARSER_OPTIONS,
};

export interface SettingsRow {
  admin_fee_cents: number;
  per_lead_cents: number;
  bonus_per_100_cents: number;
  attendance_per_lead_cents: number;
  counted_colors: string[];
  niet_ingepland_x_telt: boolean;
  wafu_t_telt: boolean;
  max_pogingen_per_lead: number;
}

export function settingsFromRow(row: SettingsRow | null): AppSettings {
  if (!row) return DEFAULT_SETTINGS;
  return {
    commissie: {
      adminFeeCents: row.admin_fee_cents,
      perLeadCents: row.per_lead_cents,
      bonusPer100Cents: row.bonus_per_100_cents,
      attendancePerLeadCents: row.attendance_per_lead_cents,
      countedColors: row.counted_colors as ColorClass[],
    },
    parser: {
      nietIngeplandXTelt: row.niet_ingepland_x_telt,
      wafuTTelt: row.wafu_t_telt,
      maxPogingenPerLead: row.max_pogingen_per_lead,
    },
  };
}

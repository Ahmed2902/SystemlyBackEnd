// src/config/verticals.config.ts

export const VERTICAL_CONFIG = {
  salon: {
    modules: { scheduling: true, crm: true, inventory: false },
    serviceCategories: ["Hair", "Nails", "Skin", "Makeup"],
  },
  clinic: {
    modules: { scheduling: true, crm: true, inventory: false },
    serviceCategories: ["Consultation", "Procedure", "Follow-up"],
  },
  retail: {
    modules: { scheduling: false, crm: false, inventory: true },
    serviceCategories: [],
  },
} as const;

export type Vertical = keyof typeof VERTICAL_CONFIG;
export type ModuleName = "scheduling" | "crm" | "inventory";

export function isValidVertical(vertical: string): vertical is Vertical {
  return Object.prototype.hasOwnProperty.call(VERTICAL_CONFIG, vertical);
}

export function getVerticalConfig(vertical: string) {
  return VERTICAL_CONFIG[vertical as Vertical] ?? null;
}

export function isModuleEnabled(
  vertical: string,
  moduleName: ModuleName,
): boolean {
  return Boolean(getVerticalConfig(vertical)?.modules[moduleName]);
}

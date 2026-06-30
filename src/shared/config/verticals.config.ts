// src/config/verticals.config.ts

export const VERTICAL_CONFIG = {
  salon: {
    modules: {
      scheduling: true,
      clinicalRecords: false,
      appointmentPhotos: true,
    },
  },
  clinic: {
    modules: {
      scheduling: true,
      clinicalRecords: true,
      appointmentPhotos: true,
    },
  },
} as const;

export type Vertical = keyof typeof VERTICAL_CONFIG;
export type ModuleName = "scheduling" | "clinicalRecords" | "appointmentPhotos";

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

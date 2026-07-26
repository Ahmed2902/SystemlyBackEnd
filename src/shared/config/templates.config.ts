export const TEMPLATE_CATALOG = {
  "aura-wellness": { vertical: "salon" },
  "clinic-clarity": { vertical: "clinic" },
} as const;

export type TemplateId = keyof typeof TEMPLATE_CATALOG;
export type TemplateVertical = (typeof TEMPLATE_CATALOG)[TemplateId]["vertical"];

export function isKnownTemplate(templateId: string): templateId is TemplateId {
  return Object.prototype.hasOwnProperty.call(TEMPLATE_CATALOG, templateId);
}

export function isTemplateAllowedForVertical(
  templateId: string,
  vertical: string,
): boolean {
  return isKnownTemplate(templateId) && TEMPLATE_CATALOG[templateId].vertical === vertical;
}

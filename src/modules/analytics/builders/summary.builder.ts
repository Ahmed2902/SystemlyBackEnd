import type {
  AnalyticsDashboardContext,
  SummarySection,
} from "../analytics.types";

export const buildSummary = (
  ctx: AnalyticsDashboardContext,
): SummarySection => {
  return { ...ctx.summary };
};

export default buildSummary;

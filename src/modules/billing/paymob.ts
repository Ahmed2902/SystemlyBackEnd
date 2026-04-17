import { PAYMOB } from "../../shared/config/config";

const API_BASE = "https://accept.paymobsolutions.com/api";

const getFetch = () => {
  if (typeof (globalThis as any).fetch === "function") return (globalThis as any).fetch;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("node-fetch");
};

export const createPaymobOrder = async (amountCents: number, currency = "EGP", description = "") => {
  if (!PAYMOB.API_KEY) throw new Error("Paymob API key not configured");

  // Placeholder: implement actual Paymob order creation using API keys
  const fetch = getFetch();
  await Promise.resolve();
  return { orderId: `paymob-order-${Date.now()}`, amountCents, currency, description } as any;
};

export const verifyWebhook = async (headers: Record<string, string>, body: any) => {
  // Paymob webhook verification depends on their signing method.
  // For now, just return the parsed body and trust it is verified by upstream (replace in prod).
  return { verified: true, payload: body };
};

export default { createPaymobOrder, verifyWebhook };

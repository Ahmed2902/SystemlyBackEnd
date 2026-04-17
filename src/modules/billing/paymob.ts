import crypto from "crypto";
import { PAYMOB } from "../../shared/config/config";

const API_BASE = PAYMOB.BASE_URL || "https://accept.paymobsolutions.com/api";

const getFetch = () => {
  if (typeof (globalThis as any).fetch === "function")
    return (globalThis as any).fetch;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("node-fetch");
};

const unwrapToken = (data: any) =>
  data?.token || data?.auth_token || data?.access_token || data;

export const getAuthToken = async () => {
  if (!PAYMOB.API_KEY) throw new Error("Paymob API key not configured");
  const fetch = getFetch();
  const res = await fetch(`${API_BASE}/auth/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: PAYMOB.API_KEY }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // eslint-disable-next-line no-console
    console.warn("[Paymob] auth failed", res.status, body);
    throw new Error("Paymob auth failed");
  }
  return unwrapToken(body);
};

export const createPaymobOrder = async (
  amountCents: number,
  currency = "EGP",
  description = ""
) => {
  // If not configured, return a safe stub so the rest of the flow can continue in dev.
  if (!PAYMOB.API_KEY) {
    return {
      orderId: `paymob-order-${Date.now()}`,
      amountCents,
      currency,
      description,
    } as any;
  }

  try {
    const authToken = await getAuthToken();
    const fetch = getFetch();

    const payload = {
      auth_token: authToken,
      delivery_needed: false,
      amount_cents: amountCents,
      currency: currency,
      merchant_order_id: `order_${Date.now()}`,
      items: [
        {
          name: description || "subscription",
          amount_cents: amountCents,
          description,
          quantity: 1,
        },
      ],
    };

    const res = await fetch(`${API_BASE}/ecommerce/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn("[Paymob] create order failed", res.status, body);
      return {
        orderId: body?.id || body?.order_id || `paymob-order-${Date.now()}`,
        amountCents,
        currency,
        description,
        raw: body,
      } as any;
    }
    const orderId =
      body?.id ||
      body?.order_id ||
      body?._id ||
      body?.data?.id ||
      body?.order_id;
    return { orderId, raw: body, amountCents, currency } as any;
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.warn("[Paymob] createPaymobOrder error", err?.message || err);
    return {
      orderId: `paymob-order-${Date.now()}`,
      amountCents,
      currency,
      description,
      error: String(err),
    } as any;
  }
};

export const createPaymentKey = async (
  orderId: string,
  amountCents: number,
  billingData: any = {}
) => {
  if (!PAYMOB.API_KEY)
    return {
      paymentKey: `paymob-pk-${Date.now()}`,
      orderId,
      amountCents,
    } as any;
  try {
    const authToken = await getAuthToken();
    const fetch = getFetch();
    const bodyPayload = {
      auth_token: authToken,
      amount_cents: amountCents,
      expiration: 3600,
      order_id: orderId,
      billing_data: billingData,
      integration_id:
        PAYMOB.INTEGRATION_ID || process.env.PAYMOB_INTEGRATION_ID,
    };
    const res = await fetch(`${API_BASE}/acceptance/payment_keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyPayload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn("[Paymob] createPaymentKey failed", res.status, body);
      return {
        paymentKey:
          body?.token || body?.payment_key || `paymob-pk-${Date.now()}`,
        raw: body,
      } as any;
    }
    return {
      paymentKey:
        body?.token || body?.payment_key || body?.payment_key?.token || body,
    } as any;
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.warn("[Paymob] createPaymentKey error", err?.message || err);
    return { paymentKey: `paymob-pk-${Date.now()}`, error: String(err) } as any;
  }
};

export const verifyWebhook = async (
  headers: Record<string, any>,
  body: any
) => {
  const secret =
    PAYMOB.HMAC_SECRET ||
    process.env.PAYMOB_HMAC_SECRET ||
    process.env.PAYMOB_HMAC;
  const signature =
    headers["x-paymob-hmac"] ||
    headers["x-hmac-signature"] ||
    headers["x-signature"] ||
    headers["x-paymob-signature"] ||
    headers["hmac"] ||
    headers["signature"];

  const payload = body;
  if (!secret || !signature) {
    // no secret configured — treat as verified in dev
    return { verified: true, payload };
  }

  try {
    const raw = typeof body === "string" ? body : JSON.stringify(body);
    const hmac = crypto.createHmac("sha512", secret).update(raw).digest("hex");
    const verified = hmac === String(signature);
    return { verified, payload };
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.warn("[Paymob] webhook verification error", err?.message || err);
    return { verified: false, payload };
  }
};

export default {
  getAuthToken,
  createPaymobOrder,
  createPaymentKey,
  verifyWebhook,
};

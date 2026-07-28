import type { Task } from "graphile-worker";
import { prisma } from "../shared/db/prisma";

type EtaReceiptPayload = {
  invoiceId: string;
};

export const etaReceiptTask: Task = async (rawPayload) => {
  const payload = rawPayload as EtaReceiptPayload;
  if (!payload?.invoiceId) {
    throw new Error("eta_receipt requires invoiceId");
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: payload.invoiceId },
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      etaReceiptUid: true,
    },
  });

  if (!invoice) {
    throw new Error(`Invoice ${payload.invoiceId} was not found`);
  }

  if (invoice.etaReceiptUid) {
    console.log("[ETA] Receipt already submitted; skipping duplicate job", {
      invoiceId: invoice.id,
      etaReceiptUid: invoice.etaReceiptUid,
    });
    return;
  }

  if (invoice.status !== "paid") {
    throw new Error(
      `Invoice ${invoice.invoiceNumber} must be paid before ETA submission`,
    );
  }

  // Placeholder until the real Egyptian Tax Authority integration is added.
  // Keeping this inside a Graphile task gives us retries, locking and durable
  // execution without blocking the API request that collected payment.
  await new Promise((resolve) => setTimeout(resolve, 200));
  const etaUid = `ETA-${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 8)
    .toUpperCase()}`;

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { etaReceiptUid: etaUid, etaSubmittedAt: new Date() },
  });

  console.log("[ETA] Receipt submitted", {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    etaReceiptUid: etaUid,
  });
};

export default etaReceiptTask;

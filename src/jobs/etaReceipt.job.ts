import { prisma } from "../shared/db/prisma";
import { enqueueEtaJob } from "../queues/etaQueue";

/**
 * ETA e-receipt job registration.
 * In a real environment, this would call the Egyptian Tax Authority API.
 * For now, it simulates the submission and updates the Invoice.
 */
export const register = () => {
  // The processor is started by the worker importing from queues/processor.ts
  // We just expose the trigger function here.
  console.log("[ETA] ETA receipt job registered");
};

/**
 * Trigger an ETA receipt submission for an invoice.
 * Called from the markPaid controller/handler.
 */
export const triggerEtaReceipt = async (invoice: {
  id: string;
  invoiceNumber: string;
  totalCents: number;
  businessId: string;
  customer: { name: string };
}) => {
  try {
    // Simulate ETA API delay
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Generate a fake ETA receipt UID
    const etaUid = `ETA-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Update the invoice with the ETA receipt info
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        etaReceiptUid: etaUid,
        etaSubmittedAt: new Date(),
      },
    });

    console.log(
      `[ETA] Receipt submitted for invoice ${invoice.invoiceNumber}: ${etaUid}`,
    );
  } catch (err) {
    console.error(
      `[ETA] Failed to submit receipt for invoice ${invoice.invoiceNumber}:`,
      err,
    );
    throw err; // Let BullMQ handle retries
  }
};

export default { register, triggerEtaReceipt };

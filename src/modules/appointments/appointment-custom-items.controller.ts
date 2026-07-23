import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../shared/db/prisma";
import { fail, ok } from "../../shared/utils/response.util";

const replaceCustomItemsSchema = z.array(
  z.object({
    description: z.string().trim().min(1).max(255),
    quantity: z.number().int().min(1),
    priceCents: z.number().int().min(0),
  }),
);

class AppointmentCustomItemsController {
  async replace(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = req.user?.businessId;
      if (!businessId) return fail(res, "Business id missing", 403, "FORBIDDEN");

      const appointmentId = String(req.params.appointmentId);
      const parsed = replaceCustomItemsSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);

      const appointment = await prisma.appointment.findFirst({
        where: { id: appointmentId, businessId },
        select: { id: true, status: true },
      });
      if (!appointment) return fail(res, "Appointment not found", 404, "NOT_FOUND");
      if (appointment.status === "completed") {
        return fail(
          res,
          "Completed appointments cannot be edited",
          409,
          "INVALID_STATE",
        );
      }

      const items = await prisma.$transaction(async (tx) => {
        await tx.appointmentCustomItem.deleteMany({ where: { appointmentId } });
        if (parsed.data.length > 0) {
          await tx.appointmentCustomItem.createMany({
            data: parsed.data.map((item) => ({
              appointmentId,
              description: item.description,
              quantity: item.quantity,
              priceCents: item.priceCents,
            })),
          });
        }
        return tx.appointmentCustomItem.findMany({
          where: { appointmentId },
          orderBy: { createdAt: "asc" },
        });
      });

      return ok(res, items);
    } catch (error) {
      return next(error);
    }
  }
}

export default new AppointmentCustomItemsController();

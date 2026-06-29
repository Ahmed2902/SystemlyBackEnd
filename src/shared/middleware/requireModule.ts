import { Request, Response, NextFunction } from "express";
import { isModuleEnabled, ModuleName } from "../config/verticals.config";
import { prisma } from "../../shared/db/prisma"; // adjust to your actual prisma import path

export function requireModule(moduleName: ModuleName) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const businessId = req.user?.businessId;
      if (!businessId) {
        return res.status(403).json({ code: "NO_BUSINESS" });
      }

      const business = await prisma.business.findUnique({
        where: { id: businessId },
        select: { vertical: true },
      });

      if (
        !business?.vertical ||
        !isModuleEnabled(business.vertical, moduleName)
      ) {
        return res
          .status(403)
          .json({ code: "MODULE_DISABLED", module: moduleName });
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

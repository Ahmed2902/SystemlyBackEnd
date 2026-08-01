import fs from "node:fs";

const path = "src/modules/invoices/invoices.workspace.controller.ts";
let source = fs.readFileSync(path, "utf8");

function replaceRequired(pattern, replacement, label) {
  if (!pattern.test(source)) {
    if (source.includes(replacement.trim().slice(0, 80))) {
      console.log(`${label} already applied`);
      return;
    }
    throw new Error(`Could not apply ${label}`);
  }
  source = source.replace(pattern, replacement);
  console.log(`applied ${label}`);
}

replaceRequired(
  /import invoicesCommandService from "\.\/invoices\.command\.service";/,
  `import invoicesCommandService from "./invoices.command.service";
import { prisma } from "../../shared/db/prisma";
import { createReceiptDocument } from "./receipt-pdf";`,
  "receipt imports",
);

replaceRequired(
  /  listInvoicesQuerySchema,\n  voidInvoiceSchema,/,
  `  listInvoicesQuerySchema,
  receiptLocaleQuerySchema,
  voidInvoiceSchema,`,
  "receipt query schema import",
);

source = source.replace(
  /\nconst RECEIPT_WIDTH = 226\.77;[\s\S]*?function paymentMethodLabel\(method: unknown\) \{[\s\S]*?\n\}\n\nclass InvoiceWorkspaceController/,
  "\nclass InvoiceWorkspaceController",
);

replaceRequired(
  /  async receipt\(req: Request, res: Response, next: NextFunction\) \{[\s\S]*?\n  \}\n\}\n\nexport default new InvoiceWorkspaceController\(\);/,
  `  async receipt(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = req.user?.businessId;
      const userId = req.user?.id;
      if (!businessId || !userId) {
        return fail(res, "Business user context missing", 403, "FORBIDDEN");
      }

      const params = invoiceIdParamsSchema.safeParse(req.params);
      if (!params.success) return next(params.error);
      const query = receiptLocaleQuerySchema.safeParse(req.query);
      if (!query.success) return next(query.error);

      const [invoice, user] = await Promise.all([
        invoicesQueryService.get(params.data.id, businessId),
        prisma.businessUser.findUnique({
          where: { id: userId },
          select: { preferredLanguage: true },
        }),
      ]);
      const locale =
        query.data.locale ?? (user?.preferredLanguage === "ar" ? "ar" : "en");
      const doc = createReceiptDocument(invoice, locale);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        \`attachment; filename="receipt-\${invoice.invoiceNumber}-\${locale}.pdf"\`,
      );
      doc.pipe(res);
      doc.end();
    } catch (error) {
      return next(error);
    }
  }
}

export default new InvoiceWorkspaceController();`,
  "receipt endpoint",
);

fs.writeFileSync(path, source);
console.log(`updated ${path}`);

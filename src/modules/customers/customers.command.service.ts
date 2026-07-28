import { prisma } from "../../shared/db/prisma";
import type {
  CreateCustomerBody,
  UpdateCustomerBody,
} from "./customers.schema";

function notFoundError() {
  const error = new Error("Customer not found") as Error & {
    statusCode?: number;
    code?: string;
  };
  error.statusCode = 404;
  error.code = "NOT_FOUND";
  return error;
}

function normalizeNullable(value: string | null | undefined) {
  if (value === undefined) return undefined;
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

class CustomersCommandService {
  createCustomer(businessId: string, input: CreateCustomerBody) {
    return prisma.customer.create({
      data: {
        businessId,
        name: input.name.trim(),
        phone: input.phone.trim(),
        email: normalizeNullable(input.email),
        acquisitionSource: normalizeNullable(input.acquisitionSource),
        notes: normalizeNullable(input.notes),
      },
    });
  }

  async updateCustomer(
    id: string,
    businessId: string,
    input: UpdateCustomerBody,
  ) {
    const existing = await prisma.customer.findFirst({
      where: { id, businessId },
      select: { id: true },
    });
    if (!existing) throw notFoundError();

    return prisma.customer.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.phone !== undefined ? { phone: input.phone.trim() } : {}),
        ...(input.email !== undefined
          ? { email: normalizeNullable(input.email) }
          : {}),
        ...(input.acquisitionSource !== undefined
          ? { acquisitionSource: normalizeNullable(input.acquisitionSource) }
          : {}),
        ...(input.notes !== undefined
          ? { notes: normalizeNullable(input.notes) }
          : {}),
      },
    });
  }

  updateNotes(
    id: string,
    businessId: string,
    notes?: string | null,
  ) {
    return this.updateCustomer(id, businessId, { notes });
  }
}

export default new CustomersCommandService();

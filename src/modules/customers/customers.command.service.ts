import { Prisma } from "@prisma/client";
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

function normalizeDateOfBirth(value: string | null | undefined) {
  if (value === undefined) return undefined;
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

type CustomerDemographics = {
  dateOfBirth: Date | null;
  gender: string | null;
};

async function getDemographics(id: string, businessId: string) {
  const [row] = await prisma.$queryRaw<CustomerDemographics[]>(Prisma.sql`
    SELECT
      date_of_birth AS "dateOfBirth",
      gender
    FROM customers
    WHERE id = ${id}::uuid AND business_id = ${businessId}::uuid
    LIMIT 1
  `);
  return row ?? { dateOfBirth: null, gender: null };
}

async function updateDemographics(
  id: string,
  businessId: string,
  input: Pick<UpdateCustomerBody, "dateOfBirth" | "gender">,
) {
  if (input.dateOfBirth !== undefined) {
    const dateOfBirth = normalizeDateOfBirth(input.dateOfBirth);
    await prisma.$executeRaw(Prisma.sql`
      UPDATE customers
      SET date_of_birth = ${dateOfBirth}
      WHERE id = ${id}::uuid AND business_id = ${businessId}::uuid
    `);
  }
  if (input.gender !== undefined) {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE customers
      SET gender = ${input.gender ?? null}
      WHERE id = ${id}::uuid AND business_id = ${businessId}::uuid
    `);
  }
}

class CustomersCommandService {
  async createCustomer(businessId: string, input: CreateCustomerBody) {
    const customer = await prisma.customer.create({
      data: {
        businessId,
        name: input.name.trim(),
        phone: input.phone.trim(),
        email: normalizeNullable(input.email),
        acquisitionSource: normalizeNullable(input.acquisitionSource),
        notes: normalizeNullable(input.notes),
      },
    });
    await updateDemographics(customer.id, businessId, input);
    return { ...customer, ...(await getDemographics(customer.id, businessId)) };
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

    const customer = await prisma.customer.update({
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
    await updateDemographics(id, businessId, input);
    return { ...customer, ...(await getDemographics(id, businessId)) };
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

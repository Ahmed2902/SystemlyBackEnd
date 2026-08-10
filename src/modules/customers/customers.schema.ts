import { z } from "zod";

export const customerIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const listCustomersQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  filter: z
    .enum(["all", "upcoming", "no_upcoming", "no_shows", "recent"])
    .default("all"),
  view: z.enum(["directory", "search"]).default("directory"),
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().nullable();

const optionalDateOfBirth = z
  .string()
  .date()
  .optional()
  .nullable()
  .refine(
    (value) => !value || new Date(`${value}T00:00:00.000Z`).getTime() <= Date.now(),
    "Date of birth cannot be in the future",
  );

export const createCustomerSchema = z.object({
  name: z.string().trim().min(1).max(255),
  phone: z.string().trim().min(5).max(30),
  email: z.string().trim().email().max(255).optional().nullable(),
  dateOfBirth: optionalDateOfBirth,
  gender: z.enum(["male", "female"]).optional().nullable(),
  acquisitionSource: optionalText(120),
  notes: optionalText(5000),
});

export const updateCustomerSchema = createCustomerSchema.partial();

export const updateCustomerNotesSchema = z.object({
  notes: optionalText(5000),
});

export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
export type CreateCustomerBody = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerBody = z.infer<typeof updateCustomerSchema>;
export type UpdateCustomerNotesBody = z.infer<
  typeof updateCustomerNotesSchema
>;

export const customersSchemas = {
  customerIdParamsSchema,
  listCustomersQuerySchema,
  createCustomerSchema,
  updateCustomerSchema,
  updateCustomerNotesSchema,
};

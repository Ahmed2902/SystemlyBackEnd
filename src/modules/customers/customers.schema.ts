import { z } from "zod";

export const listCustomersQuerySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
});

export const updateCustomerNotesSchema = z.object({
  notes: z.string().optional(),
});

export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
export type UpdateCustomerNotesBody = z.infer<typeof updateCustomerNotesSchema>;

export const customersSchemas = {
  listCustomersQuerySchema,
  updateCustomerNotesSchema,
};

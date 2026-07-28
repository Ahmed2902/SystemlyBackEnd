import { Roles } from "@prisma/client";
import { z } from "zod";

const inviteRoleSchema = z.enum([Roles.Staff, Roles.Receptionist]);

export const createInviteSchema = z
  .object({
    email: z.string().trim().email(),
    role: inviteRoleSchema,
    expiresInDays: z.number().int().min(1).max(30).optional(),
  })
  .strict();

export const acceptInviteSchema = z
  .object({
    token: z.string().min(1),
  })
  .strict();

export type CreateInviteInput = z.infer<typeof createInviteSchema>;
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

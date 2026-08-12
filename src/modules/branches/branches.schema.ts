import { z } from "zod";

const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional();

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must use HH:mm format");

const branchFields = {
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  phone: optionalText(30),
  address: z.string().trim().nullable().optional(),
  city: optionalText(120),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  timezone: z.literal("Africa/Cairo").default("Africa/Cairo"),
};

const branchSetupServiceSchema = z.object({
  clientId: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(255),
  category: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(2000).optional(),
  durationMin: z
    .number()
    .int()
    .min(5)
    .refine((value) => value % 5 === 0, {
      message: "Duration must be in 5-minute increments",
    }),
  priceEgp: z.number().nonnegative(),
});

const branchSetupAvailabilitySchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: timeSchema,
    endTime: timeSchema,
  })
  .refine((entry) => entry.startTime < entry.endTime, {
    message: "Availability end time must be after start time",
  });

const branchSetupStaffSchema = z.object({
  clientId: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(255),
  jobTitle: z.string().trim().max(120).optional(),
  serviceClientIds: z.array(z.string().trim().min(1)).min(1),
  availability: z.array(branchSetupAvailabilitySchema).min(1),
});

export const branchIdParamsSchema = z.object({
  branchId: z.string().uuid(),
});

export const createBranchSchema = z.object(branchFields).strict();

export const setupBranchSchema = z
  .object({
    ...branchFields,
    services: z.array(branchSetupServiceSchema).min(1),
    staff: z.array(branchSetupStaffSchema).min(1),
    receptionistEmail: z.string().trim().email().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const serviceIds = new Set<string>();
    value.services.forEach((service, index) => {
      if (serviceIds.has(service.clientId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["services", index, "clientId"],
          message: "Service client ids must be unique",
        });
      }
      serviceIds.add(service.clientId);
    });

    const staffIds = new Set<string>();
    value.staff.forEach((staff, staffIndex) => {
      if (staffIds.has(staff.clientId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["staff", staffIndex, "clientId"],
          message: "Staff client ids must be unique",
        });
      }
      staffIds.add(staff.clientId);

      const assignedServices = new Set<string>();
      staff.serviceClientIds.forEach((serviceClientId, serviceIndex) => {
        if (!serviceIds.has(serviceClientId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["staff", staffIndex, "serviceClientIds", serviceIndex],
            message: "Assigned service does not exist in this branch setup",
          });
        }
        if (assignedServices.has(serviceClientId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["staff", staffIndex, "serviceClientIds", serviceIndex],
            message: "A service can only be assigned once per staff member",
          });
        }
        assignedServices.add(serviceClientId);
      });

      const workingDays = new Set<number>();
      staff.availability.forEach((entry, availabilityIndex) => {
        if (workingDays.has(entry.dayOfWeek)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["staff", staffIndex, "availability", availabilityIndex, "dayOfWeek"],
            message: "Each working day can only appear once per staff member",
          });
        }
        workingDays.add(entry.dayOfWeek);
      });
    });
  });

export const updateBranchSchema = z
  .object({
    name: branchFields.name.optional(),
    slug: branchFields.slug.optional(),
    phone: branchFields.phone,
    address: branchFields.address,
    city: branchFields.city,
    lat: branchFields.lat,
    lng: branchFields.lng,
    timezone: branchFields.timezone.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type SetupBranchInput = z.infer<typeof setupBranchSchema>;
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;

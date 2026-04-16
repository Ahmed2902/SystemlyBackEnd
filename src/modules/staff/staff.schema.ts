import { Roles } from "@prisma/client";

export type StaffCreateInput = {
  name: string;
  role?: Roles;
  photoUrl?: string;
  isActive?: boolean;
};

export type StaffUpdateInput = {
  name?: string;
  role?: Roles;
  photoUrl?: string;
  isActive?: boolean;
};

export type AvailabilityEntry = {
  dayOfWeek: number; // 0-6
  startTime: string; // ISO datetime or HH:MM
  endTime: string; // ISO datetime or HH:MM
  breakAfterMin?: number;
};

export type AvailabilityOverrideInput = {
  overrideDate: string; // ISO date
  isDayOff?: boolean;
  startTime?: string | null;
  endTime?: string | null;
};

export type PaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  perPage: number;
};

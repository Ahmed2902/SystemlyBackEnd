export type BusinessUpdateInput = {
  name?: string;
  phone?: string;
  address?: string;
  city?: string;
  vertical?: string;
  timezone?: string;
  language?: string;
};

export type BusinessStats = {
  customersCount: number;
  appointmentsCount: number;
  servicesCount: number;
  staffCount: number;
};

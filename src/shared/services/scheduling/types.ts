export interface ServiceSelection {
  serviceId: string;
  staffId?: string;
}

export interface SlotAssignment {
  serviceId: string;
  staffId: string;
}

export interface AvailableSlot {
  time: string;
  display: string;
  assignments: SlotAssignment[];
}

export interface ScheduledSegment {
  serviceId: string;
  staffId: string;
  start: Date;
  end: Date;
  durationMin: number;
  priceEgp: number;
}

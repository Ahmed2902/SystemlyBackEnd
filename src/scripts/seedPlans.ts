import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const plans = [
  {
    name: "Starter",
    priceEgp: new Prisma.Decimal("199.00"),
    maxStaff: 3,
    maxBookingsPerMonth: 1000,
    smsReminders: false,
    customDomain: false,
  },
  {
    name: "Growth",
    priceEgp: new Prisma.Decimal("499.00"),
    maxStaff: 10,
    maxBookingsPerMonth: 5000,
    smsReminders: false,
    customDomain: false,
  },
  {
    name: "Pro",
    priceEgp: new Prisma.Decimal("999.00"),
    maxStaff: null,
    maxBookingsPerMonth: 50000,
    smsReminders: true,
    customDomain: true,
  },
];

const seed = async () => {
  try {
    for (const p of plans) {
      // upsert by name
      await prisma.plan.upsert({
        where: { name: p.name },
        update: p,
        create: p as any,
      });
      console.log("Seeded plan:", p.name);
    }
  } catch (err) {
    console.error("Failed to seed plans:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
};

void seed();

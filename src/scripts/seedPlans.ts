import { prisma } from "../shared/db/prisma";
import { ensureCorePlan } from "../modules/subscriptions/subscription.seed";

async function main() {
  const { plan, price } = await ensureCorePlan();
  console.log(
    `[subscriptions] ensured ${plan.code} at ${price.amountCents} ${price.currency} per month`,
  );
}

void main()
  .catch((error) => {
    console.error("[subscriptions] failed to seed plans", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

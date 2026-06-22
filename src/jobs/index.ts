import reminderJob from "./reminder.job";
import subscriptionJob from "./subscription.job";
import etaReceiptJob from "./etaReceipt.job";

export const registerJobs = () => {
  console.log("Registering background jobs...");
  reminderJob.register();
  subscriptionJob.register();
  etaReceiptJob.register();
};

export default { registerJobs };

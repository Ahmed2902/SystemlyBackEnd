import reminderJob from "./reminder.job";
import subscriptionJob from "./subscription.job";

export const registerJobs = () => {
  console.log("Registering background jobs...");
  reminderJob.register();
  subscriptionJob.register();
};

export default { registerJobs };

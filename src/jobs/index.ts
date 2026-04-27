import reminderJob from "./reminder.job";
import subscriptionJob from "./subscription.job";
import noShowJob from "./noShow.job";

export const registerJobs = () => {
  console.log("Registering background jobs...");
  reminderJob.register();
  subscriptionJob.register();
  noShowJob.register();
};

export default { registerJobs };

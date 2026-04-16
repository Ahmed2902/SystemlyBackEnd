import reminderJob from "./reminder.job";

export const registerJobs = () => {
  console.log("Registering background jobs...");
  reminderJob.register();
};

export default { registerJobs };

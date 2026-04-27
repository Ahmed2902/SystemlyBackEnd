import cron from "node-cron";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import appointmentService from "../modules/appointments/appointments.service";

dayjs.extend(utc);
dayjs.extend(timezone);

const CRON_EXPRESSION = "30 * * * *"; // every hour at minute 30
const TZ = "Africa/Cairo";

const register = () => {
  // run immediately then schedule
  void appointmentService
    .markNoShows(30)
    .then(() => {
      // eslint-disable-next-line no-console
      console.log("[NoShowJob] Initial run complete");
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[NoShowJob] Initial run error", err);
    });

  cron.schedule(
    CRON_EXPRESSION,
    () => {
      void appointmentService.markNoShows(30).catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[NoShowJob] Scheduled run error", err);
      });
    },
    { timezone: TZ }
  );

  // eslint-disable-next-line no-console
  console.log(`[NoShowJob] Registered - cron ${CRON_EXPRESSION} tz=${TZ}`);
};

export default { register };

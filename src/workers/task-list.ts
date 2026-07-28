import type { TaskList } from "graphile-worker";
import sendEmailTask from "./email.worker";
import etaReceiptTask from "./eta.worker";

export const taskList: TaskList = {
  send_email: async (payload, helpers) => {
    await sendEmailTask(payload, helpers);
  },
  eta_receipt: etaReceiptTask,
};

export default taskList;

import type { TaskList } from "graphile-worker";
import sendEmailTask from "./email.worker";
import etaReceiptTask from "./eta.worker";

export const taskList: TaskList = {
  send_email: sendEmailTask,
  eta_receipt: etaReceiptTask,
};

export default taskList;

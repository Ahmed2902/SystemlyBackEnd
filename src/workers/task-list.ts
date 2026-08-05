import type { TaskList } from "graphile-worker";
import sendEmailTask from "./email.worker";

export const taskList: TaskList = {
  send_email: sendEmailTask,
};

export default taskList;

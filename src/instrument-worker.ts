import "./shared/config/env";
import { initializeSentry } from "./shared/observability/sentry";

initializeSentry("worker");

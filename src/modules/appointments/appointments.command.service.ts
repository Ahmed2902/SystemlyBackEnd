import appointmentsService from "./appointments.service";

/**
 * Command-side entry point for appointment mutations.
 *
 * The existing implementation is kept behind this boundary in this PR so the
 * HTTP layer uses the same CQRS-lite shape as the other modules. A later
 * mechanical cleanup can move the implementation without changing callers.
 */
export default appointmentsService;

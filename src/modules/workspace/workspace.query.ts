import calendarService from "../calendar/calendar.service";
import customersService from "../customers/customers.service";
import invoicesQueryService from "../invoices/invoices.query.service";
import staffWorkspaceService from "../staff/staff.workspace.service";
import type { ListCustomersQuery } from "../customers/customers.schema";
import type { ListInvoicesQuery } from "../invoices/invoices.workspace.schema";
import type { StaffDirectoryQuery } from "../staff/staff.schema";

type AuthUser = NonNullable<Express.Request["user"]>;

/**
 * CQRS-lite read side for screens that aggregate multiple domain models.
 *
 * Existing HTTP routes remain in their domain modules. Controllers delegate
 * read-only list/detail work here, while writes continue through the owning
 * customer, staff, appointment, and invoice services.
 */
class WorkspaceQuery {
  calendarDay(businessId: string, date: string) {
    return calendarService.getWorkspace(businessId, date);
  }

  customerList(businessId: string, query: ListCustomersQuery) {
    return customersService.listCustomers(businessId, query);
  }

  customerDetail(customerId: string, businessId: string) {
    return customersService.getWorkspace(customerId, businessId);
  }

  customerAppointments(customerId: string, businessId: string) {
    return customersService.getAppointments(customerId, businessId);
  }

  staffDirectory(user: AuthUser, query: StaffDirectoryQuery) {
    return staffWorkspaceService.listDirectory(user, query);
  }

  staffDetail(staffId: string, user: AuthUser) {
    return staffWorkspaceService.getWorkspace(staffId, user);
  }

  invoiceList(businessId: string, query: ListInvoicesQuery) {
    return invoicesQueryService.list(businessId, query);
  }

  invoiceDetail(invoiceId: string, businessId: string) {
    return invoicesQueryService.get(invoiceId, businessId);
  }
}

export default new WorkspaceQuery();

import calendarQueryService from "../calendar/calendar.query.service";
import customersQueryService from "../customers/customers.query.service";
import invoicesQueryService from "../invoices/invoices.query.service";
import staffQueryService from "../staff/staff.query.service";
import type { ListCustomersQuery } from "../customers/customers.schema";
import type { ListInvoicesQuery } from "../invoices/invoices.workspace.schema";
import type { StaffDirectoryQuery } from "../staff/staff.schema";

type AuthUser = NonNullable<Express.Request["user"]>;

/**
 * CQRS-lite read side for screens that aggregate multiple domain models.
 */
class WorkspaceQuery {
  calendarDay(businessId: string, date: string) {
    return calendarQueryService.getWorkspace(businessId, date);
  }

  customerList(businessId: string, query: ListCustomersQuery) {
    return customersQueryService.listCustomers(businessId, query);
  }

  customerDetail(customerId: string, businessId: string) {
    return customersQueryService.getWorkspace(customerId, businessId);
  }

  customerAppointments(customerId: string, businessId: string) {
    return customersQueryService.getAppointments(customerId, businessId);
  }

  staffDirectory(user: AuthUser, query: StaffDirectoryQuery) {
    return staffQueryService.listDirectory(user, query);
  }

  staffDetail(staffId: string, user: AuthUser) {
    return staffQueryService.getWorkspace(staffId, user);
  }

  invoiceList(businessId: string, query: ListInvoicesQuery) {
    return invoicesQueryService.list(businessId, query);
  }

  invoiceDetail(invoiceId: string, businessId: string) {
    return invoicesQueryService.get(invoiceId, businessId);
  }
}

export default new WorkspaceQuery();

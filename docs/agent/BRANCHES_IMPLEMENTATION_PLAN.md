# Systemly Multi-Branch Implementation Plan

> Read this document before every commit that touches the multi-branch rollout.
>
> Core invariant: **BusinessAdmin is business-scoped. Receptionist is branch-scoped. Operational pages always operate on exactly one branch. Owner analytics may operate on one branch or all branches.**

## Product decision

Systemly is branch-native even for businesses with one physical location.

Every Business has at least one Branch. Existing and newly onboarded single-location businesses behave as they do today: their only active branch is resolved automatically and the UI does not force an unnecessary selector.

### Business-owned/shared data

- Business identity: name, slug, vertical, language
- BusinessAdmin/owner
- Subscription and billing account
- Website content, branding, template, hero, gallery, FAQs, social links
- Customers and CRM identity
- Loyalty account/customer-level history unless explicitly changed later

### Branch-owned operational data

- Branch location/contact/timezone
- Staff
- Receptionists
- Services
- Staff availability, overrides, breaks and time off through branch-owned staff
- Appointments
- Invoices
- Calendar and daily operations

Customers remain business-wide. A customer may visit multiple branches. The Appointment records where the visit occurred.

## Authorization model

### BusinessAdmin

- belongs to a Business, not one Branch
- `BusinessUser.businessId` is set
- `BusinessUser.branchId` is null
- may access every active/inactive branch owned by that business subject to endpoint rules
- must select one branch for operational pages/actions
- dashboard analytics uses its own independent scope: one branch or all branches

### Receptionist

- belongs to one Business and exactly one Branch
- `BusinessUser.businessId` and `BusinessUser.branchId` are set
- branch assignment is controlled by the owner/invitation, never chosen by the receptionist
- may not override branch scope through query/body/path manipulation
- cross-branch request mismatches return 403 rather than silently accepting another branch

### Staff login

If/when a Staff user is represented through BusinessUser, use the same fixed-branch rule as Receptionist.

## Branch context rules

- Calendar: exactly one branch
- Appointments list/detail/create: exactly one branch for owner; fixed branch for receptionist
- Staff/services/availability/breaks: exactly one branch
- Invoices: exactly one branch for operational views; an owner-wide aggregate/list can be added intentionally
- Customers: business-wide CRM identity; branch-specific visit/activity is derived through appointments
- Dashboard: separate analytics selector supporting `All branches` or one branch

Do not use a single global frontend `selectedBranchId` for both operations and analytics. Keep an operational branch selection and dashboard analytics scope independent.

## Public website and booking

There is still one website per Business.

Business-wide sections:
- logo and branding
- hero/about
- gallery
- FAQs
- template/colors
- social links

Branch-sensitive sections:
- branch/location selector when more than one active branch exists
- address, phone, map
- services
- team
- booking availability

If a Business has exactly one active branch, select it automatically and preserve today's UX.

Public booking carries `branchId` from selection through availability and appointment creation. The backend validates the branch belongs to the requested business and that every selected service/staff member belongs to that branch.

## Analytics semantics

Introduce a shared scope concept:

```ts
interface AnalyticsScope {
  businessId: string;
  branchId?: string; // omitted = all branches
}
```

### Branch-filterable in V1

- revenue and revenue trend
- invoice totals/count/average
- appointments/completed/cancelled/no-show
- cancellation and no-show rates
- booking channels
- operations volume/busy periods
- staff performance/utilization/commissions
- service performance
- active/unique customers based on distinct customers with qualifying appointments in the branch

### Customer caveats

Customers are shared across the Business.

- All-branch customer counts use `COUNT(DISTINCT customerId)` and must not sum branch counts.
- "New customer" remains first-ever customer of the Business in V1. A customer visiting Maadi for the first time after previously visiting New Cairo is returning, not new.
- Branch-specific LTV should be labeled as customer revenue/contribution in that branch, not total business LTV.
- Acquisition source remains business-wide in V1 because it lives on Customer.
- Retention cohorts remain business-wide in V1 until branch-specific semantics are explicitly implemented.
- Combined utilization/rates use weighted totals; never average branch percentages naively.

## Billing decision

Systemly Core remains the base subscription and includes one active branch.

Pricing:

- 1 active branch: 799 EGP/month
- each additional active branch: +350 EGP/month

Billing formula in cents:

```ts
basePriceCents + Math.max(0, activeBranchCount - 1) * 35_000
```

For V1:
- adding a branch activates it immediately
- no mid-cycle proration
- additional branch charge applies on the next renewal
- deactivating a branch preserves historical data and removes the add-on on the next renewal
- never hard-delete a branch that has historical operational data
- checkout/payment records must store enough pricing snapshot information to explain the charged amount

## Production rollout safety

The repository production workflow deploys only successful push-triggered CI runs whose head branch is `main` and only when `AZURE_DEPLOY_ENABLED == 'true'`.

Rules for this rollout:

1. Feature PRs must be independently mergeable into `main`.
2. Early PRs are additive/backward-compatible and must not expose an unfinished multi-branch UI.
3. Existing one-branch behavior must continue after every intermediate merge.
4. Public/add-branch activation is only exposed once scheduling, website, booking, operations and analytics are branch-safe.
5. Do not rely on an unfinished feature flag to protect database correctness; schema and backend compatibility must stand on their own.
6. Do not remove legacy Business location fields until all consumers read from Branch.

## PR sequence

### PR 1 — Branch foundation and compatibility migration

Backend.

- add `Branch`
- add Business relations
- add nullable/backfilled `branchId` to Staff, Service, Appointment, Invoice and StaffInvite
- create one Main Branch for existing businesses using existing location fields
- backfill existing operational records
- add indexes/constraints
- preserve existing API behavior
- no public multi-branch UX yet
- tests for migration assumptions/data invariants where practical

Acceptance:
- every existing business has one branch after migration
- existing operations still work without callers supplying branchId
- no existing operational row is left without a branch after backfill

### PR 2 — Branch authorization and management

Backend.

- add branch CRUD/deactivate/reactivate module
- add nullable `BusinessUser.branchId`
- add `StaffInvite.branchId` and require a branch for receptionist invites
- include branchId in access-token claims for branch-bound users
- centralize operational branch-context resolution
- BusinessAdmin: requested branch must belong to own business
- Receptionist: fixed to token/account branch; mismatches return 403
- branch reassignment refreshes auth/session claims
- security/integration tests

Acceptance:
- owner can access own branches only
- receptionist cannot access another branch by manipulating request data
- receptionist invite binds exactly one branch

### PR 3 — Branch-native onboarding

Backend + frontend onboarding contract.

- first onboarding creates Business + first Branch + Website + trial
- location/phone/timezone move conceptually into the first Branch
- services and staff created under first Branch
- website preview remains business-wide
- keep compatibility handling while old Business location fields still exist

Acceptance:
- no newly onboarded Business exists without a Branch
- one-branch onboarding UX remains simple

### PR 4 — Branch-scoped staff/services/scheduling

Backend.

- branch-scope staff/service CRUD and queries
- enforce same-branch service/staff assignment
- update scheduling core/eligibility/free-interval lookup
- keep availability tied to branch-owned Staff rather than duplicating branchId unnecessarily on every availability row
- branch-scope breaks/time-off access where appropriate
- preserve customer business-wide identity
- integration tests for cross-branch scheduling rejection

Acceptance:
- impossible to book Branch A with Branch B staff or services

### PR 5 — Branch-aware appointments/invoices/operations API

Backend.

- appointment listing/create/update/reschedule/detail use resolved operational branch context
- invoices inherit branch from appointment; do not trust client branch for appointment invoices
- branch-scope calendar/operations data
- maintain business-wide invoice numbering for V1
- branch-aware permissions for Receptionist
- integration tests

Acceptance:
- owner sees exactly selected branch operations
- receptionist sees exactly assigned branch operations

### PR 6 — Public website branch context

Backend public API + frontend public website.

- public business response exposes active branches
- selected branch controls location/service/team data
- one branch auto-selects with no extra user step
- multi-branch site gets location selector
- use stable branch slug for shareable selection (`?branch=<slug>` is acceptable for V1)
- website-wide content remains shared

Acceptance:
- one-branch website looks/behaves like current production
- multi-branch website can switch location safely

### PR 7 — Branch-aware public booking

Backend + frontend booking.

- availability accepts branchId
- booking creation accepts branchId
- validate branch belongs to business
- validate selections belong to branch
- selected branch persists through booking flow and confirmation
- business-wide customer upsert remains `(businessId, phone)`
- integration/E2E coverage

Acceptance:
- customer visiting another branch reuses the same Customer record
- appointment records the selected branch

### PR 8 — Owner operational branch selector

Frontend + supporting backend contract polish.

- BusinessAdmin selects exactly one operational branch for Calendar, Appointments, Staff, Services, Availability and branch operations
- auto-select only active branch for one-branch businesses
- Receptionist sees no branch selector and is always fixed to assigned branch
- Customers stay business-wide, with branch labels/history where useful
- keep operational branch selection independent from dashboard scope

Acceptance:
- no `All branches` option on branch-bound operational pages

### PR 9 — Branch-aware analytics

Backend + dashboard frontend.

- analytics `AnalyticsScope`
- Dashboard selector: All branches or one branch
- scope cache keys by branch/all
- revenue, appointment, operations, staff, service and safe customer metrics become branch-aware
- weighted combined rates/utilization
- distinct-customer aggregation across all branches
- retain business-wide semantics for acquisition/retention and clearly label/disable where branch filtering would be misleading
- branch comparison dataset/table
- tests against duplicate customers and incorrect summed/averaged rates

Acceptance:
- All branches is mathematically correct and not a sum of branch percentages/customer counts
- changing dashboard scope does not change operational branch selection

### PR 10 — Add Branch wizard, branch pricing and cleanup

Backend + frontend.

Add Branch wizard:
- location/contact
- services
- team/receptionist
- per-staff availability
- review/create
- no business identity fields
- no website preview
- optional convenience: copy services from another branch by duplicating, not linking

Billing:
- first branch included
- +350 EGP/month per additional active branch
- next-renewal pricing, no proration in V1
- pricing snapshot/breakdown on payment
- update billing UI/landing copy

Cleanup only after all consumers are migrated:
- remove/deprecate single-location reads from Business
- remove old Business location columns in a later safe migration if no longer needed
- update docs/OpenAPI/E2E

Acceptance:
- feature can be exposed to customers safely
- branch creation cannot exceed any future entitlement/limit introduced later
- historical branch data survives deactivation

## Engineering constraints

- Do not over-engineer.
- Prefer existing module/service patterns and existing files.
- Create a new module only for the first-class `Branch` resource itself.
- Keep tenant checks explicit (`businessId`) even where branch relation can imply the business.
- Keep database invariants strong and validate cross-branch relationships in services/transactions.
- Avoid speculative features such as staff shared across branches, service overrides, branch transfers, branch-specific invoice counters, branch-specific loyalty, proration or advanced retention until demanded.
- Every PR must update/add relevant tests.
- Every PR must keep CI/build/OpenAPI expectations green.
- Do not expose `+ Add Branch` until the dependent backend/public/operations/analytics work is ready.

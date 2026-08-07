# Systemly Architecture

## 1. Deployment shape

V1 deliberately uses one backend container and one Node.js process.

```text
Internet
   |
Azure Container Apps ingress
   |
Node.js process
   |-- Express API
   `-- Embedded Graphile Worker
          `-- send_email

Node.js
   |-- PostgreSQL / Supabase
   |-- Redis (optional analytics cache)
   |-- Supabase Storage
   |-- Resend
   `-- Sentry
```

This is intentional for the initial scale. A separate worker service is unnecessary while the only asynchronous work is HTTP-triggered transactional email.

Azure pilot scaling is min replicas 0 / max replicas 1. If scheduled jobs are added later, scale-to-zero must be revisited because a PostgreSQL job alone does not create HTTP traffic to wake the app.

## 2. Application boundaries

### Routes and middleware

Responsible for:

- authentication
- roles
- business/tenant access
- resource ownership
- validation
- CSRF and rate limiting

Tenant authorization belongs at this boundary rather than being duplicated as ad-hoc service assertions.

### Services

Responsible for:

- domain invariants
- transactions
- business state transitions
- database operations after request authorization has succeeded

Examples of service-level rules are appointment state transitions, availability overlap prevention, staff deactivation constraints, and financial invariants.

## 3. Multi-tenancy

Every tenant-owned request is resolved against the authenticated `businessId` before the service is called. Resources that expose only their own UUID in the route use focused ownership middleware.

Public website APIs use explicit projections and never return internal Prisma models wholesale.

## 4. Scheduling and time

Recurring business hours are wall-clock rules in the business timezone. They are not permanent UTC instants.

For a concrete appointment:

1. interpret local input in the stored business timezone
2. validate availability/conflicts in that business timezone
3. convert the resulting segment instants to UTC
4. persist UTC timestamps
5. convert back to business-local time for presentation

PostgreSQL transaction-scoped advisory locks serialize competing bookings for the same staff/business day.

## 5. Appointment lifecycle

`Customer.visitCount` means completed appointments only.

- first transition to `completed` => increment once
- repeated completion => no-op
- revert/void from `completed` => decrement once
- pending, confirmed, in-progress, canceled, no-show and uncancel do not affect visit count

Public customer cancellation is limited to valid future booking states and is idempotent.

## 6. Authentication

- access tokens are short-lived JWT bearer tokens
- refresh tokens are opaque HttpOnly cookies and are stored hashed in PostgreSQL
- refresh/logout use signed CSRF tokens plus Origin validation
- verification/reset tokens are opaque, hashed, one-time PostgreSQL records
- Redis may accelerate auth-token lookup but never makes the security decision
- Google OAuth uses browser-bound state + PKCE and establishes the same refresh-cookie session as password login
- Systemly access/refresh tokens are never placed in OAuth redirect URLs

## 7. Email jobs

Graphile Worker persists jobs in PostgreSQL. The embedded worker currently registers only `send_email`.

Supported mail includes:

- email verification
- welcome
- password reset
- staff invitation

Resend is the only production email provider. Provider delivery is idempotency-keyed.

## 8. Database and migrations

Prisma is the schema/migration tool for application tables. Graphile Worker has its own schema migration.

Production rollout order is fixed:

1. Backend CI passes on an exact SHA
2. build/push image for that SHA
3. `prisma migrate deploy` using the migration connection
4. Graphile schema-only migration using the migration connection
5. update Azure Container App image
6. wait for `/health/ready`

The running application uses its separate Supabase Session Pooler `DATABASE_URL`.

Financial writes use PostgreSQL transactions. Payment-critical serializable conflicts are retried; database constraints provide the final duplicate-payment safety net.

## 9. Redis

Redis is not a source of truth in V1.

Its active responsibility is fail-open analytics caching. If Redis is unavailable, the database-backed application must continue to authenticate users, book appointments, and operate normally; analytics may simply perform uncached reads.

## 10. Media

Two storage classes are explicit:

### Public media

Branding and website gallery assets that are intended for public pages.

### Private media

Appointment/clinical photos. Uploads use signed tickets; persistence verifies expected path/ownership, metadata, MIME and size; reads return short-lived signed URLs.

The Supabase service-role key exists only on the backend.

## 11. Billing

Subscription lifecycle is modeled in PostgreSQL. EasyKash self-service integration remains pending for the initial feedback pilot.

During the pilot, SuperAdmin may extend a trial explicitly through the protected admin billing endpoint. Manual extension never creates a fake payment record.

## 12. Observability

- structured JSON application logs
- Sentry error capture with sensitive request fields stripped
- `/health/live` for process liveness
- `/health/ready` for database + embedded worker readiness
- optional Prometheus metrics endpoint where enabled

## 13. Security rules

- bearer access token only for normal protected API routes
- HttpOnly cookie only for refresh session
- CSRF only where cookies authenticate the action
- strict allowed Origin checks
- explicit public DTOs
- tenant/resource ownership in middleware
- hashed opaque security tokens at rest
- production environment validation fails fast on required secrets
- application container runs as non-root

## 14. Scaling triggers

Do not split services merely for anticipated scale.

Revisit the one-process design when one of these becomes true:

- delayed/scheduled background jobs must execute while HTTP traffic is zero
- email/job throughput needs independent scaling
- API replicas need to exceed one and a shared rate-limit strategy becomes necessary
- database workload justifies dedicated replicas or other topology changes

Until then, one API/worker container is simpler and cheaper.

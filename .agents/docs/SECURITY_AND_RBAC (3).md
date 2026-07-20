# Security and RBAC

## Auth model

Backend auth middleware supports:

- Bearer access token in `Authorization` header
- optional `accessToken` cookie fallback

The frontend mainly uses Bearer access token in memory and refresh token cookie for renewal.

## User payload

`requireAuth` sets `req.user` with:

- `id`
- `businessId`
- `role`
- `email`

Do not assume `businessId` always exists. Users may be registered but not onboarded.

## Roles

Prisma roles:

- `SuperAdmin`
- `BusinessAdmin`
- `Staff`
- `Receptionist`
- `User`

## Guard behavior

`requireRole(roles)`:

- Allows `SuperAdmin` automatically.
- Allows listed roles.
- Otherwise returns 403.

`requireBusinessAccess`:

- Allows `SuperAdmin` automatically.
- Resolves businessId from params, body, query, or `req.user.businessId`.
- Rejects missing businessId.
- Rejects businessId mismatch.

`requireAppointmentOwnerOrAdmin`:

- Reads `req.params.appointmentId`.
- Loads appointment.
- Allows `SuperAdmin`.
- Allows `BusinessAdmin` for same business.
- Allows `Receptionist` for same business.
- Allows `Staff` only if `appointment.staffId === req.user.id`.

## Important warning for multi-staff appointments

The current staff check uses `appointment.staffId`, but multi-staff appointments also have `AppointmentService.staffId` per segment.

If staff accounts become real, update staff authorization to allow staff assigned to any appointment segment, not just the parent `appointment.staffId`.

## Analytics access

Product intent:

- Dashboard/analytics should be owner-only.
- Do not expose revenue, invoices, commission totals, or business performance analytics to staff/receptionist unless explicitly requested.

## CSRF

Cookie flows such as refresh/logout are CSRF-protected in frontend API calls through `getCsrfToken()` and `CSRF-Token` header.

Do not remove CSRF from cookie-bound mutation flows without replacing it with another safe mechanism.

## CORS

The backend uses credentialed CORS and allowed origins from config.

When changing frontend/backend URLs, update environment configuration rather than hardcoding origins.

## Tenant isolation checklist

For every query or mutation involving business-owned data:

- Is `businessId` present?
- Is it verified against `req.user.businessId`?
- Is `SuperAdmin` the only bypass?
- Are nested records scoped indirectly through appointment/business ownership?
- Are public endpoints intentionally public and limited to safe data?

# Backend Agent Task Template

Use this structure when giving Codex/backend agents a task.

```md
## Goal

Describe the exact behavior to implement or bug to fix.

## Relevant files to inspect first

- `src/modules/...`
- `prisma/schema.prisma`
- Frontend adapter if API contract changes

## Current behavior

What currently happens?

## Expected behavior

What should happen after the change?

## Constraints

- Preserve response envelope.
- Preserve businessId tenant isolation.
- Do not rewrite unrelated code.
- Keep existing route naming conventions.

## Acceptance criteria

- [ ] Build passes.
- [ ] Relevant tests pass or manual test steps are documented.
- [ ] Frontend contract is still valid.
- [ ] Edge cases handled.

## Manual test steps

1. ...
```

## Example task: refresh calendar after payment

```md
## Goal

After collecting payment in operations calendar, the page should refresh appointment state and show the appointment as paid/locked without manual browser refresh.

## Relevant files

Backend:
- `src/modules/invoices/invoices.service.ts`
- `src/modules/invoices/invoices.controller.ts`
- `src/modules/appointments/appointments.service.ts`

Frontend:
- `src/modules/operations/Calendar.api.ts`
- `src/app/operations/calendar/page.tsx`
- `src/shared/lib/Calendar/adapter.ts`

## Expected behavior

Click Collect Payment -> backend marks/creates paid invoice -> frontend reloads calendar -> selected appointment shows paid/locked state.

## Constraints

Do not confuse cancel, uncancel, and revert. Revert should be for paid/completed/no-show reopening. Uncancel should only show for cancelled appointments.
```

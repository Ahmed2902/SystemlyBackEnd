# Workspace read side

This module is the query side for operational screens that combine data from more than one domain.

- Existing URLs stay under `/calendar`, `/customers`, `/staff`, and `/invoices`.
- Controllers send list/detail reads through `workspace.query.ts`.
- Mutations stay in the owning domain service.
- The module does not introduce events, a second database, or duplicated write models.

This is intentionally CQRS-lite: it creates a clear read/write boundary without adding infrastructure the current product does not need.

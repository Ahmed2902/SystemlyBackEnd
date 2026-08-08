# Systemly Go-Live Checklist

This checklist is the final operational gate before allowing real client data into Systemly. A repository/CI green state is necessary but does not replace the external checks below.

## 1. Merge and CI order

Merge the pre-live PRs in their planned order. After every merge:

- confirm the PR targeted `main`
- wait for Backend CI on the resulting `main` SHA
- do not continue if TypeScript, OpenAPI, PostgreSQL tests, Docker build, migrations, liveness or readiness fail

After the final merge, record the exact production SHA.

## 2. Production configuration

In Azure Container Apps, confirm all required runtime values exist:

- `NODE_ENV=production`
- `DATABASE_URL` — Supabase Session Pooler runtime URL
- `JWT_SECRET` — at least 32 characters
- `JWT_REFRESH_SECRET` — at least 32 characters
- `CSRF_SECRET` — at least 32 characters
- `FRONTEND_URL`
- `APP_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `SENTRY_DSN`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PUBLIC_MEDIA_BUCKET`
- `SUPABASE_PRIVATE_MEDIA_BUCKET`

`REDIS_URL` is optional for core availability; when configured, verify it is the intended production cache instance.

In the GitHub `production` environment confirm:

- `DATABASE_MIGRATION_URL`
- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

and variables:

- `AZURE_DEPLOY_ENABLED=true` only when automatic production deployment is intended
- `AZURE_RESOURCE_GROUP`
- `AZURE_CONTAINER_REGISTRY`
- `AZURE_API_APP`

Never configure `DATABASE_MIGRATION_URL` on the running Container App.

## 3. Database migration rehearsal

Before the first client launch and before any future risky migration:

1. create a temporary database from a recent production/staging backup or realistic sanitized dataset
2. build the exact candidate production image
3. run `npm run prisma:migrate:deploy`
4. run `npm run graphile:migrate`
5. start the image against that database
6. verify `/health/live` and `/health/ready`
7. run a representative read/write smoke test
8. inspect migration duration and any failed constraints

Do not test destructive migrations for the first time against production.

## 4. Backup and restore rehearsal

Confirm Supabase backups are enabled for the production project.

Perform one restore rehearsal before accepting clients:

1. select a known backup/snapshot
2. restore it to a safe non-production target according to the active Supabase plan
3. verify representative businesses, users, appointments and invoices
4. document the actual restore duration
5. record who has permission to initiate a restore

A backup that has never been restored is not considered verified.

## 5. Azure deployment

The pilot Container App is intentionally configured for:

- minimum replicas: 0
- maximum replicas: 1
- target port: 3000
- external HTTPS ingress
- liveness path: `/health/live`
- readiness path: `/health/ready`

After deployment:

1. confirm the deployed image tag equals the intended Git SHA
2. request `/health/live`
3. request `/health/ready`
4. allow the app to scale to zero
5. make a new HTTP request and confirm cold-start recovery
6. confirm PostgreSQL/Graphile reconnect after wake-up
7. confirm no restart loop in Azure logs

Current V1 email jobs are produced by HTTP-triggered actions, so scale-to-zero is acceptable. Revisit minimum replicas before adding jobs that must run at a future time without incoming HTTP traffic.

## 6. Real Graphile -> Resend verification

CI proves the worker starts and its schema is valid. Production must also prove provider delivery.

With the production API revision awake and production environment loaded, run:

```bash
node dist/src/scripts/verifyEmailWorker.js YOUR_REAL_EMAIL@example.com
```

Pass criteria:

- command reports `email_worker_verification_enqueued`
- deployed API logs an `email_sent` event with `emailType=welcome`
- the message reaches the target inbox

Then perform real product flows:

- register -> verification email arrives
- verify -> welcome email arrives
- forgot password -> reset email arrives
- invite receptionist -> invitation email arrives

Test at least one Gmail address and one Outlook/Microsoft address. Check spam/junk as well as inbox.

## 7. Resend domain

Confirm in Resend:

- production sending domain is verified
- SPF/DKIM records are healthy
- `EMAIL_FROM` belongs to the verified domain
- production API key, not a development key, is in Azure
- no secrets appear in logs

## 8. Google OAuth

From the real production frontend/domain:

1. start Google sign-in
2. complete consent/account selection
3. confirm callback returns to `/oauth-callback` without `token=` or other Systemly credentials in the URL
4. confirm the frontend obtains an access token through normal refresh flow
5. refresh the page and confirm the session survives
6. logout and confirm refresh/logout behavior
7. try a second simultaneous refresh scenario by opening multiple authenticated requests; the session must remain usable
8. confirm Google Console redirect URI exactly matches `GOOGLE_REDIRECT_URI`

## 9. Supabase Storage

Public bucket:

- branding/gallery asset loads without authenticated API access
- no appointment media is written to the public bucket

Private bucket:

- direct unauthenticated object access fails
- authenticated application flow produces a short-lived signed URL
- expired signed URL fails
- another tenant cannot obtain a signed URL for the first tenant's appointment media
- service-role key exists only server-side

Verify browser upload CORS from the production frontend origin.

## 10. Sentry

Repository verification only proves the Sentry integration can be initialized and exercised with test configuration. Before opening clients, verify a real production event from the deployed production revision and confirm:

- the event is visible in the intended Sentry project
- events show `environment=production`
- release is `systemly-backend@<production SHA>`
- authorization headers/cookies/request bodies are not exposed
- at least one actionable error alert is enabled

Do not mark this gate complete until the production event is visible in Sentry.

## 11. Frontend/backend production smoke

Run this against the deployed production candidate, not localhost:

1. register
2. receive and use verification email
3. login with password
4. login with Google
5. complete onboarding
6. configure business hours
7. create staff
8. assign services to staff
9. upload branding/gallery media
10. open public website
11. check public availability
12. create a public booking using business-local time
13. confirm stored/displayed time is correct
14. cancel a future customer booking twice; second call must be harmless
15. create a front-desk appointment
16. move an appointment to in-progress
17. complete it and verify visit count increases once
18. revert/void completed state and verify visit count decreases once
19. collect cash payment
20. double-submit collect payment and verify one current paid invoice
21. void and pay again
22. open analytics
23. reset password
24. logout
25. scale Azure to zero, wake it through HTTP, and repeat login/booking basics

## 12. Tenant-isolation smoke

Keep two test businesses A and B. While authenticated as A, attempt to use B's known IDs for:

- business mutation
- FAQ
- staff
- service assignment
- availability/override/break/time off
- appointment
- invoice
- media

All must be rejected. Never perform this test using real client records.

## 13. Pilot billing

EasyKash self-service billing is intentionally not a launch dependency for the feedback pilot.

Before a trial expires, either integrate EasyKash or use the SuperAdmin pilot-extension endpoint. Do not edit subscription rows manually in production and do not create fake payment rows for manual access extension.

Record any money collected outside Systemly separately until EasyKash is live.

## 14. Monitoring during the first clients

For the first pilot period, check daily:

- Azure restarts and failed revisions
- Sentry new errors
- failed Graphile jobs / missing transactional mail
- PostgreSQL connection saturation
- Supabase storage failures
- unexpected 401/refresh issues
- booking conflicts
- invoice/payment anomalies

Keep max replicas at 1 until there is a demonstrated reason to scale horizontally and shared rate limiting/concurrency behavior has been revisited.

## Go-live decision

Real client data may be accepted only when:

- all pre-live code PRs are merged in order and `main` is green
- production deployment succeeds on the intended SHA
- real Graphile -> Resend delivery passes
- OAuth production flow passes
- public/private storage checks pass
- backup restore has been rehearsed
- a real production Sentry event and alerting configuration have been verified
- the frontend/backend smoke passes
- no unresolved critical/high launch blocker remains

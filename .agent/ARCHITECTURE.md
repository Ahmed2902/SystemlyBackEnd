# Architecture

## Layer pattern (strict — never skip layers)

Route → Controller → Service → Model

- Route: URL + middleware only, calls controller
- Controller: extracts req data, calls service, sends res
- Service: all business logic, calls models + external APIs
- Model: DB queries only, no logic

## Folder structure

src/
modules/
auth/
auth.routes.ts
auth.controller.ts
auth.service.ts
auth.validator.ts

    business/
      business.routes.ts
      business.controller.ts
      business.service.ts
      business.model.ts

    staff/
      staff.routes.ts
      staff.controller.ts
      staff.service.ts
      staff.model.ts

    booking/
      booking.routes.ts
      booking.controller.ts
      booking.service.ts
      availability.service.ts
      booking.validator.ts
      appointment.model.ts

    customers/
      customers.routes.ts
      customers.controller.ts
      customers.service.ts
      customer.model.ts

    billing/
      billing.routes.ts
      billing.controller.ts
      billing.service.ts
      subscription.model.ts

    services/
      services.routes.ts
      services.controller.ts
      services.service.ts
      services.model.ts

    webhooks/
      webhooks.routes.ts
      webhooks.controller.ts

    content/
      websiteContent.model.ts
      faq.model.ts

shared/
db/
prisma.ts

    middleware/
      auth.middleware.ts
      validate.middleware.ts
      rateLimit.middleware.ts
      plan.middleware.ts
      errorHandler.middleware.ts

    utils/
      slots.util.ts
      slug.util.ts
      whatsapp.templates.ts
      response.util.ts

    config/
      constants.ts
      redis.ts
      cloudinary.ts

    services/
      whatsapp.service.ts
      cloudinary.service.ts

jobs/
reminder.job.ts
noShow.job.ts
subscriptionExpiry.job.ts
otpCleanup.job.ts

tests/
auth.test.ts
booking.test.ts
availability.test.ts

## Key rules

- Models never touch req/res or external APIs
- Services never touch req/res
- Controllers never query the DB directly
- All errors thrown as: const e = new Error(msg); e.statusCode = 4xx; e.code = 'CODE'; throw e
- All responses use ok(res, data) or fail(res, msg, status, code) from response.util.js
- WhatsApp sends are always done with setImmediate() after DB commits — never inside transactions

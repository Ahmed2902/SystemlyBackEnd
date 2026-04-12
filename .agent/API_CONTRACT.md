# API contract

Base URL: /api
Auth header: Authorization: Bearer {accessToken}
Cookies: refreshToken (httpOnly, set by /auth/login)
All responses: { success: true, data: {...} } or { success: false, error: "msg", code: "CODE" }

## Auth

POST /auth/register body: {name, email, password, phone} → {businessId}
POST /auth/send-otp body: {phone} → {sent: true}
POST /auth/verify-otp body: {phone, otp} → {verified: true}
POST /auth/login body: {email, password} → {accessToken, user} + sets cookie
POST /auth/refresh (uses cookie) → {accessToken}
POST /auth/logout (clears cookie) → {message}

## Business (auth required unless noted)

GET /businesses/check-slug/:slug (public) → {available, slug}
GET /businesses/public/:slug (public) → full business object for website render
PATCH /businesses/:id → updated business
PATCH /businesses/:id/publish → {is_active: true}
GET /businesses/:id/website-content → website_content row
PATCH /businesses/:id/website-content → updated website_content
POST /businesses/:id/photos multipart → {url}
GET /businesses/:id/stats → {todayCount, weekCount, totalCustomers...}

## Staff

GET/POST /staff query: ?businessId
PATCH/DELETE /staff/:id
POST /staff/:id/services body: {serviceIds: []}
POST /staff/:id/availability body: [{day_of_week, start_time, end_time}]
POST /staff/:id/availability/overrides body: {override_date, is_day_off, ...}
DELETE /staff/:id/availability/overrides/:overrideId

## Services

GET/POST/PATCH/DELETE /services query: ?businessId for GET

## Bookings (public — no auth)

GET /bookings/availability query: ?staffId&serviceId&date&businessId → {slots: [ISO strings]}
POST /bookings body: {businessId, staffId, serviceId, startsAt, customerName, customerPhone}
POST /bookings/cancel/:token (public cancel link)

## Appointments (auth required)

GET /appointments query: ?date=today OR ?from=&to=
POST /appointments manual walk-in booking
PATCH /appointments/:id/status body: {status}
PATCH /appointments/:id/notes body: {notes}

## Customers

GET /customers query: ?businessId&search&page
GET /customers/:id
PATCH /customers/:id/notes

## Billing

GET /plans
POST /subscriptions/create-checkout body: {planId} → {checkoutUrl}
GET /subscriptions/current → {plan, status, usage}
POST /webhooks/paymob (raw body — HMAC validated)

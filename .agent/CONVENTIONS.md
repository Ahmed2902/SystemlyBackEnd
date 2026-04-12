# Coding conventions

## Error throwing (always this pattern)

const throwErr = (msg, status, code) => {
const e = new Error(msg); e.statusCode = status; e.code = code; throw e
}

## Response format (always use these helpers)

ok(res, data, status = 200) → { success: true, data }
fail(res, msg, status, code) → { success: false, error: msg, code }

## Model pattern

const create = (data) =>
db('table').insert({ id: uuid(), ...data }).returning('\*').then(r => r[0])

## Validation

Every POST/PATCH route gets validate(schema) middleware before the controller
Zod schemas live in validators/ — one file per domain

## Async/await

Always use async/await — never .then() chains in services or controllers
Always wrap controller bodies in try/catch and call next(err)

## Environment

Never hardcode secrets — always process.env.KEY
All config values (timeouts, limits, status enums) go in config/constants.js

## WhatsApp

Always use the stub pattern — if no WASSENGER_API_KEY, log to console
Never await WhatsApp sends inside DB transactions — use setImmediate()

## Naming

Files: kebab-case (auth.service.ts, user.model.ts)
Variables/functions: camelCase
Constants: UPPER_SNAKE_CASE

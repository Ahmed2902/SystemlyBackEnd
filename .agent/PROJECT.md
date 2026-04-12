# Hgezli

Service booking SaaS for Egyptian clinics and salons.
Vondera equivalent but for service businesses, not e-commerce.

## Stack

- Backend: Node.js + Express, PostgreSQL (Knex), Redis, JWT auth
- Frontend: React (Vite) dashboard + Next.js public site
- WhatsApp: Wassenger API (stub in dev — logs to console)
- Payments: Paymob
- Hosting: Railway (backend), Vercel (frontend), Supabase (DB)

## What it does

Business owner signs up → gets a generated public website at hgezli.com/their-slug
→ customers visit and book appointments → owner manages via dashboard
→ WhatsApp reminders sent automatically 24hrs before each appointment

## Monetization

Free: 20 bookings/month, 1 staff, no reminders
Basic (249 EGP/mo): unlimited bookings, 3 staff, reminders
Pro (499 EGP/mo): unlimited everything, custom domain

## Team

- You: backend (Node.js)
- Friend: frontend (React + Next.js)

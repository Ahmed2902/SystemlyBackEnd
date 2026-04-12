# Database schema summary

## businesses

id (uuid PK), name, slug (unique), vertical, phone, address, city
lat, lng, logo_url, cover_url, timezone, language, is_active, timestamps

## business_users

id, business_id (FK→businesses CASCADE), name, email (unique)
password_hash, phone, phone_verified, role, last_login_at, timestamps

## staff

id, business_id (FK), name, role, photo_url, is_active, timestamps

## services

id, business_id (FK), name, duration_min, price_egp, description, is_active, timestamps

## service_staff (join)

service_id (FK), staff_id (FK) — composite PK

## availability

id, staff_id (FK), day_of_week (0=Sun..6=Sat), start_time, end_time
break_after_min, timestamps

## availability_overrides

id, staff_id (FK), override_date, is_day_off, start_time, end_time, timestamps

## customers

id, business_id (FK), name, phone, visit_count, no_show_count, notes
last_visit_at, timestamps — UNIQUE(business_id, phone)

## appointments

id, business_id (FK), staff_id (FK), service_id (FK), customer_id (FK)
starts_at, ends_at, status (enum below), reminder_sent, cancel_token (uuid unique)
notes, timestamps

STATUS ENUM: pending | confirmed | cancelled_by_customer | cancelled_by_business | no_show | completed

## website_content

id, business_id (FK unique), tagline, about_text, template, primary_color
secondary_color, font, custom_domain, section_order (jsonb), show_team
show_faq, show_reviews, meta_title, meta_description, timestamps

## faqs

id, business_id (FK), question, answer, display_order, timestamps

## plans

id, name (unique), price_egp, max_staff (null=unlimited)
max_bookings_per_month (null=unlimited), sms_reminders, custom_domain, timestamps

## subscriptions

id, business_id (FK unique), plan_id (FK), status
current_period_start, current_period_end, paymob_subscription_id, timestamps

## sms_logs

id, appointment_id (FK nullable), phone, message_type, status
gateway_id, error_message, sent_at

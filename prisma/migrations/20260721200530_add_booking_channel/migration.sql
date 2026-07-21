-- CreateEnum
CREATE TYPE "BookingChannel" AS ENUM ('UNKNOWN', 'WEBSITE', 'FRONT_DESK', 'WHATSAPP', 'PHONE', 'OTHER');

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "booking_channel" "BookingChannel" NOT NULL DEFAULT 'UNKNOWN';

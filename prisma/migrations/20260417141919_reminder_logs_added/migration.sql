-- CreateTable
CREATE TABLE "reminder_logs" (
    "id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "when_key" VARCHAR(50) NOT NULL,
    "channel" VARCHAR(50),
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminder_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reminder_logs_appointment_id_idx" ON "reminder_logs"("appointment_id");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_logs_appointment_id_when_key_key" ON "reminder_logs"("appointment_id", "when_key");

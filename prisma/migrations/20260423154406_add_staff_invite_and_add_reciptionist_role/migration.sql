-- AlterEnum
ALTER TYPE "Roles" ADD VALUE 'Receptionist';

-- CreateTable
CREATE TABLE "staff_invites" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "role" "Roles" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_invites_token_hash_key" ON "staff_invites"("token_hash");

-- CreateIndex
CREATE INDEX "staff_invites_business_id_idx" ON "staff_invites"("business_id");

-- AddForeignKey
ALTER TABLE "staff_invites" ADD CONSTRAINT "staff_invites_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

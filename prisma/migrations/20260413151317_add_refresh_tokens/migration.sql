/*
  Warnings:

  - A unique constraint covering the columns `[current_refresh_token_id]` on the table `business_users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "business_users" ADD COLUMN     "current_refresh_token_id" UUID;

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "business_users_current_refresh_token_id_key" ON "business_users"("current_refresh_token_id");

-- AddForeignKey
ALTER TABLE "business_users" ADD CONSTRAINT "business_users_current_refresh_token_id_fkey" FOREIGN KEY ("current_refresh_token_id") REFERENCES "refresh_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "business_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

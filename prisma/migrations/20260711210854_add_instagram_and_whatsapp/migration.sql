/*
  Warnings:

  - You are about to drop the `website_setup` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "website_setup" DROP CONSTRAINT "website_setup_business_id_fkey";

-- DropForeignKey
ALTER TABLE "website_setup" DROP CONSTRAINT "website_setup_owner_user_id_fkey";

-- AlterTable
ALTER TABLE "website_content" ADD COLUMN     "instagram_url" VARCHAR(255),
ADD COLUMN     "whatsapp_number" VARCHAR(30);

-- DropTable
DROP TABLE "website_setup";

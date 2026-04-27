-- CreateTable
CREATE TABLE "photos" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "public_id" VARCHAR(255) NOT NULL,
    "caption" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "photos_business_id_idx" ON "photos"("business_id");

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

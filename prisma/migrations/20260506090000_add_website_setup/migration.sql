CREATE TABLE "website_setup" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "step" INTEGER NOT NULL DEFAULT 1,
    "template_id" VARCHAR(80) NOT NULL DEFAULT 'modern',
    "published_at" TIMESTAMP(3),
    "draft_envelope" JSONB NOT NULL,
    "site_draft" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "website_setup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "website_setup_business_id_key" ON "website_setup"("business_id");
CREATE INDEX "website_setup_owner_user_id_idx" ON "website_setup"("owner_user_id");

ALTER TABLE "website_setup"
ADD CONSTRAINT "website_setup_business_id_fkey"
FOREIGN KEY ("business_id") REFERENCES "businesses"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "website_setup"
ADD CONSTRAINT "website_setup_owner_user_id_fkey"
FOREIGN KEY ("owner_user_id") REFERENCES "business_users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "PaligCarrier" AS ENUM ('PAN_AMERICAN_LIFE_COLOMBIA');
CREATE TYPE "PaligCatalogStatus" AS ENUM ('DRAFT', 'REVIEW', 'APPROVED', 'ACTIVE', 'INACTIVE', 'ARCHIVED');
CREATE TYPE "CustomerNeedKey" AS ENUM (
  'FAMILY_PROTECTION',
  'INCOME_PROTECTION',
  'EDUCATION',
  'RETIREMENT_PENSION_GAP',
  'CAPITAL_ACCUMULATION',
  'ACCIDENT_PROTECTION',
  'CRITICAL_ILLNESS',
  'CANCER_PROTECTION',
  'BUSINESS_PARTNER_PROTECTION',
  'KEY_PERSON',
  'BUSINESS_CONTINUITY'
);

CREATE TABLE "customer_needs" (
  "id" UUID NOT NULL,
  "key" "CustomerNeedKey" NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "status" "PaligCatalogStatus" NOT NULL DEFAULT 'DRAFT',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_needs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "authorized_products" (
  "id" UUID NOT NULL,
  "key" VARCHAR(80) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "carrier" "PaligCarrier" NOT NULL,
  "status" "PaligCatalogStatus" NOT NULL DEFAULT 'DRAFT',
  "review_note" VARCHAR(500),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "authorized_products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "authorized_solutions" (
  "id" UUID NOT NULL,
  "key" VARCHAR(80) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "product_id" UUID,
  "status" "PaligCatalogStatus" NOT NULL DEFAULT 'DRAFT',
  "review_note" VARCHAR(500),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "authorized_solutions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "need_solution_mappings" (
  "customer_need_id" UUID NOT NULL,
  "solution_id" UUID NOT NULL,
  "status" "PaligCatalogStatus" NOT NULL DEFAULT 'DRAFT',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "need_solution_mappings_pkey" PRIMARY KEY ("customer_need_id", "solution_id")
);

ALTER TABLE "opportunities"
  ADD COLUMN "customer_need_id" UUID,
  ADD COLUMN "authorized_solution_id" UUID,
  ADD COLUMN "authorized_product_id" UUID;

CREATE UNIQUE INDEX "customer_needs_key_key" ON "customer_needs"("key");
CREATE INDEX "customer_needs_status_key_idx" ON "customer_needs"("status", "key");
CREATE UNIQUE INDEX "authorized_products_key_key" ON "authorized_products"("key");
CREATE INDEX "authorized_products_carrier_status_idx" ON "authorized_products"("carrier", "status");
CREATE UNIQUE INDEX "authorized_solutions_key_key" ON "authorized_solutions"("key");
CREATE INDEX "authorized_solutions_product_id_status_idx" ON "authorized_solutions"("product_id", "status");
CREATE INDEX "need_solution_mappings_solution_id_status_idx" ON "need_solution_mappings"("solution_id", "status");
CREATE INDEX "opportunities_customer_need_id_status_idx" ON "opportunities"("customer_need_id", "status");
CREATE INDEX "opportunities_authorized_solution_id_status_idx" ON "opportunities"("authorized_solution_id", "status");
CREATE INDEX "opportunities_authorized_product_id_status_idx" ON "opportunities"("authorized_product_id", "status");

ALTER TABLE "authorized_solutions"
  ADD CONSTRAINT "authorized_solutions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "authorized_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "need_solution_mappings"
  ADD CONSTRAINT "need_solution_mappings_customer_need_id_fkey" FOREIGN KEY ("customer_need_id") REFERENCES "customer_needs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "need_solution_mappings"
  ADD CONSTRAINT "need_solution_mappings_solution_id_fkey" FOREIGN KEY ("solution_id") REFERENCES "authorized_solutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "opportunities"
  ADD CONSTRAINT "opportunities_customer_need_id_fkey" FOREIGN KEY ("customer_need_id") REFERENCES "customer_needs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "opportunities_authorized_solution_id_fkey" FOREIGN KEY ("authorized_solution_id") REFERENCES "authorized_solutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "opportunities_authorized_product_id_fkey" FOREIGN KEY ("authorized_product_id") REFERENCES "authorized_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

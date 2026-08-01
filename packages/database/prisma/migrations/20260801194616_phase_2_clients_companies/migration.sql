-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityType" ADD VALUE 'PROSPECT_UPDATED';
ALTER TYPE "ActivityType" ADD VALUE 'TAG_ATTACHED';
ALTER TYPE "ActivityType" ADD VALUE 'TAG_DETACHED';
ALTER TYPE "ActivityType" ADD VALUE 'CLIENT_CONVERTED';
ALTER TYPE "ActivityType" ADD VALUE 'COMPANY_CREATED';

-- CreateTable
CREATE TABLE "crm_clients" (
    "id" UUID NOT NULL,
    "prospect_id" UUID NOT NULL,
    "converted_by_id" UUID NOT NULL,
    "status" "ClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "converted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_companies" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "legal_name" VARCHAR(200),
    "tax_identifier" VARCHAR(40),
    "city" VARCHAR(100),
    "email" VARCHAR(254),
    "phone" VARCHAR(30),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_company_contacts" (
    "company_id" UUID NOT NULL,
    "prospect_id" UUID NOT NULL,
    "position" VARCHAR(120),
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_company_contacts_pkey" PRIMARY KEY ("company_id","prospect_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crm_clients_prospect_id_key" ON "crm_clients"("prospect_id");

-- CreateIndex
CREATE INDEX "crm_clients_status_converted_at_idx" ON "crm_clients"("status", "converted_at");

-- CreateIndex
CREATE UNIQUE INDEX "crm_companies_tax_identifier_key" ON "crm_companies"("tax_identifier");

-- CreateIndex
CREATE INDEX "crm_companies_name_idx" ON "crm_companies"("name");

-- CreateIndex
CREATE INDEX "crm_company_contacts_prospect_id_idx" ON "crm_company_contacts"("prospect_id");

-- AddForeignKey
ALTER TABLE "crm_clients" ADD CONSTRAINT "crm_clients_prospect_id_fkey" FOREIGN KEY ("prospect_id") REFERENCES "prospects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_clients" ADD CONSTRAINT "crm_clients_converted_by_id_fkey" FOREIGN KEY ("converted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_company_contacts" ADD CONSTRAINT "crm_company_contacts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "crm_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_company_contacts" ADD CONSTRAINT "crm_company_contacts_prospect_id_fkey" FOREIGN KEY ("prospect_id") REFERENCES "prospects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

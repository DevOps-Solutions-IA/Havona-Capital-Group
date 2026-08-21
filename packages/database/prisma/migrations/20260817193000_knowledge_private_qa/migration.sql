ALTER TABLE "knowledge_collections"
ADD COLUMN "henry_enabled" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "knowledge_collections_henry_enabled_is_active_idx"
ON "knowledge_collections"("henry_enabled", "is_active");

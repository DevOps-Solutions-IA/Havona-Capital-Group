-- Calendar Core: team scope and explicit appointment responsibility.
CREATE TABLE "calendar_team_memberships" (
    "id" UUID NOT NULL,
    "manager_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "calendar_team_memberships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "calendar_team_memberships_manager_id_member_id_key"
    ON "calendar_team_memberships"("manager_id", "member_id");
CREATE INDEX "calendar_team_memberships_member_id_idx"
    ON "calendar_team_memberships"("member_id");

ALTER TABLE "calendar_team_memberships"
    ADD CONSTRAINT "calendar_team_memberships_manager_id_fkey"
    FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calendar_team_memberships"
    ADD CONSTRAINT "calendar_team_memberships_member_id_fkey"
    FOREIGN KEY ("member_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calendar_team_memberships"
    ADD CONSTRAINT "calendar_team_memberships_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "calendar_event_links" ADD COLUMN "assigned_consultant_id" UUID;
CREATE INDEX "calendar_event_links_assigned_consultant_id_start_at_idx"
    ON "calendar_event_links"("assigned_consultant_id", "start_at");
ALTER TABLE "calendar_event_links"
    ADD CONSTRAINT "calendar_event_links_assigned_consultant_id_fkey"
    FOREIGN KEY ("assigned_consultant_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

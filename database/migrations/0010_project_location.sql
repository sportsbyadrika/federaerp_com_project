-- ============================================================================
-- Migration 0010 — geo location for a project (marked on a map). Nullable
-- latitude / longitude; the UI stores a single marked point.
-- ============================================================================

ALTER TABLE projects
    ADD COLUMN latitude  DECIMAL(10,7) NULL AFTER site_address,
    ADD COLUMN longitude DECIMAL(10,7) NULL AFTER latitude;

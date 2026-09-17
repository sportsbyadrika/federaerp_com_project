-- ============================================================================
-- Migration 0014 — institution signature + company round seal images, stored
-- (like the logo) outside the web root and reusable on invoices/documents.
-- ============================================================================

ALTER TABLE organisations
    ADD COLUMN signature_path VARCHAR(400) NULL AFTER logo_path,
    ADD COLUMN seal_path      VARCHAR(400) NULL AFTER signature_path;

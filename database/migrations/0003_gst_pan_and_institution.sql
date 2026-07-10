-- ============================================================================
-- Migration 0003 — GST number + PAN on parties (rename tax_number -> pan),
-- and institution letterhead settings (GST/PAN/full name/address/logo).
-- ============================================================================

-- ---- Clients: add GST + PAN -------------------------------------------------
ALTER TABLE clients
    ADD COLUMN gst_number VARCHAR(40) NULL AFTER phone,
    ADD COLUMN pan        VARCHAR(20) NULL AFTER gst_number;

-- ---- Suppliers: rename tax_number -> pan, add GST --------------------------
ALTER TABLE suppliers
    CHANGE COLUMN tax_number pan VARCHAR(20) NULL,
    ADD COLUMN gst_number VARCHAR(40) NULL AFTER phone;

-- ---- Sub-contractors: rename tax_number -> pan, add GST --------------------
ALTER TABLE subcontractors
    CHANGE COLUMN tax_number pan VARCHAR(20) NULL,
    ADD COLUMN gst_number VARCHAR(40) NULL AFTER phone;

-- ---- Institution (organisation) letterhead settings -----------------------
-- legal_name already exists and is used as the institution's full name.
ALTER TABLE organisations
    ADD COLUMN gst_number         VARCHAR(40)  NULL AFTER legal_name,
    ADD COLUMN pan                VARCHAR(20)  NULL AFTER gst_number,
    ADD COLUMN letterhead_address VARCHAR(500) NULL AFTER pan,
    ADD COLUMN logo_path          VARCHAR(400) NULL AFTER letterhead_address;

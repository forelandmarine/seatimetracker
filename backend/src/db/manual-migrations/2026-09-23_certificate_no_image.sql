-- Certificate tracker: stop storing the certificate itself.
--
-- The certificates feature used to store an uploaded scan/photo/PDF of the
-- certificate as a base64 data-URI inline in certificates.image_url (a text
-- column), and returned it in every GET /api/certificates response. The tracker
-- is being reduced to metadata + expiry date only, so those stored scans must go.
--
-- This PURGE is safe to run at ANY time and is backward-compatible: both the old
-- and the new backend tolerate a null image_url (the new backend no longer
-- selects or writes the column at all). Idempotent.

UPDATE "certificates" SET "image_url" = NULL WHERE "image_url" IS NOT NULL;

-- OPTIONAL follow-up cleanup — drop the now-unused column entirely.
-- IMPORTANT: run this ONLY AFTER the 2.0.0 backend is fully deployed. Older
-- backend code still SELECTs certificates.image_url, so dropping the column while
-- a pre-2.0.0 backend is live would break the certificates endpoint. Once 2.0.0
-- is live (its schema no longer references image_url), this is safe:
--
--   ALTER TABLE "certificates" DROP COLUMN IF EXISTS "image_url";

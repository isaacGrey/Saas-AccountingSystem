-- Approved draft and financial source must reach their final state atomically.
-- Keep this deferred so the application can insert the document before updating the draft.
CREATE FUNCTION validate_approval_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.draft_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM document_drafts d WHERE d.id=NEW.draft_id AND d.state='posted'
 AND (d.tenant_id,d.company_id,d.kind,d.party_name,d.description,d.business_date,d.tax_code,d.net)
 IS NOT DISTINCT FROM (NEW.tenant_id,NEW.company_id,NEW.kind,NEW.party_name,NEW.description,NEW.business_date,NEW.tax_code,NEW.net)
 ) THEN RAISE EXCEPTION 'Source and approved draft must finalize together'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER approval_source_consistency AFTER INSERT ON documents DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_approval_source();

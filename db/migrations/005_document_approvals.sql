ALTER TABLE companies ADD COLUMN approval_required boolean NOT NULL DEFAULT false;
CREATE TABLE document_drafts (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL, company_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('sale','bill')), party_name text NOT NULL, description text NOT NULL,
 business_date date NOT NULL, tax_code text NOT NULL CHECK(tax_code IN ('DEMO_VAT','DEMO_NONE')), net numeric(20,2) NOT NULL CHECK(net>0),
 state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','submitted','approved','rejected','posted')),
 version integer NOT NULL DEFAULT 1, created_by uuid NOT NULL REFERENCES users, last_edited_by uuid NOT NULL REFERENCES users,
 reviewed_by uuid REFERENCES users, decision_reason text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,company_id,id), FOREIGN KEY(tenant_id,company_id) REFERENCES companies(tenant_id,id)
);
ALTER TABLE document_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_drafts FORCE ROW LEVEL SECURITY;
CREATE POLICY scope ON document_drafts USING(scoped(tenant_id,company_id)) WITH CHECK(scoped(tenant_id,company_id));
CREATE INDEX drafts_scope ON document_drafts(tenant_id,company_id,state,created_at);
GRANT SELECT,INSERT,UPDATE ON document_drafts TO tala_app;
ALTER TABLE documents ADD COLUMN draft_id uuid;
ALTER TABLE documents ADD CONSTRAINT source_draft FOREIGN KEY(tenant_id,company_id,draft_id) REFERENCES document_drafts(tenant_id,company_id,id);
CREATE UNIQUE INDEX document_once_per_draft ON documents(draft_id) WHERE draft_id IS NOT NULL;
CREATE FUNCTION protect_document_draft() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor uuid:=nullif(current_setting('app.user',true),'')::uuid; actor_role text; changed boolean;
BEGIN
 SELECT role INTO actor_role FROM memberships WHERE user_id=actor AND company_id=NEW.company_id;
 IF actor_role IS NULL OR actor_role NOT IN ('owner','accountant') THEN RAISE EXCEPTION 'Draft write permission required' USING ERRCODE='42501'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'draft' OR NEW.created_by IS DISTINCT FROM actor OR NEW.last_edited_by IS DISTINCT FROM actor OR NEW.reviewed_by IS NOT NULL OR NEW.version<>1 THEN RAISE EXCEPTION 'Draft must start unapproved'; END IF;
  RETURN NEW;
 END IF;
 IF OLD.state='posted' THEN RAISE EXCEPTION 'Posted draft is immutable'; END IF;
 IF (NEW.id,NEW.tenant_id,NEW.company_id,NEW.created_by,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.company_id,OLD.created_by,OLD.created_at) THEN RAISE EXCEPTION 'Draft identity is immutable'; END IF;
 changed:=(NEW.kind,NEW.party_name,NEW.description,NEW.business_date,NEW.tax_code,NEW.net) IS DISTINCT FROM (OLD.kind,OLD.party_name,OLD.description,OLD.business_date,OLD.tax_code,OLD.net);
 IF NEW.state='draft' AND OLD.state IN ('draft','rejected','approved') THEN
  NEW.last_edited_by:=actor; NEW.reviewed_by:=NULL;NEW.decision_reason:=NULL;
 ELSIF NEW.state='submitted' AND OLD.state='draft' AND NOT changed THEN
  NEW.last_edited_by:=OLD.last_edited_by;NEW.reviewed_by:=NULL;NEW.decision_reason:=NULL;
 ELSIF NEW.state IN ('approved','rejected') AND OLD.state='submitted' AND NOT changed THEN
  IF actor_role<>'owner' OR actor=OLD.created_by OR actor=OLD.last_edited_by THEN RAISE EXCEPTION 'Independent owner approval required' USING ERRCODE='42501'; END IF;
  IF length(trim(coalesce(NEW.decision_reason,'')))<5 THEN RAISE EXCEPTION 'Decision reason required'; END IF;
  NEW.reviewed_by:=actor;NEW.last_edited_by:=OLD.last_edited_by;
 ELSIF NEW.state='posted' AND OLD.state='approved' AND NOT changed THEN
  IF NOT EXISTS(SELECT 1 FROM documents WHERE draft_id=OLD.id) THEN RAISE EXCEPTION 'Posting requires a source document'; END IF;
  NEW.reviewed_by:=OLD.reviewed_by;NEW.decision_reason:=OLD.decision_reason;NEW.last_edited_by:=OLD.last_edited_by;
 ELSE RAISE EXCEPTION 'Invalid draft transition or changed approved content'; END IF;
 NEW.version:=OLD.version+1;NEW.updated_at:=now();RETURN NEW;
END $$;
CREATE TRIGGER draft_lifecycle BEFORE INSERT OR UPDATE ON document_drafts FOR EACH ROW EXECUTE FUNCTION protect_document_draft();
CREATE FUNCTION enforce_document_approval() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE required boolean; d document_drafts;
BEGIN
 SELECT approval_required INTO required FROM companies WHERE id=NEW.company_id FOR SHARE;
 IF NEW.draft_id IS NULL THEN
  IF required THEN RAISE EXCEPTION 'This company requires an approved draft'; END IF;
 ELSE
  SELECT * INTO d FROM document_drafts WHERE id=NEW.draft_id FOR UPDATE;
  IF d.id IS NULL OR d.state<>'approved' OR d.reviewed_by IS NULL THEN RAISE EXCEPTION 'Approved draft required'; END IF;
  IF (NEW.tenant_id,NEW.company_id,NEW.kind,NEW.party_name,NEW.description,NEW.business_date,NEW.tax_code,NEW.net) IS DISTINCT FROM (d.tenant_id,d.company_id,d.kind,d.party_name,d.description,d.business_date,d.tax_code,d.net) THEN RAISE EXCEPTION 'Posted content differs from approved draft'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER approval_gate BEFORE INSERT ON documents FOR EACH ROW EXECUTE FUNCTION enforce_document_approval();
CREATE FUNCTION set_approval_policy(c uuid, required boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM require_company_owner(c);
 IF required AND (SELECT count(*) FROM memberships WHERE company_id=c AND role='owner')<2 THEN RAISE EXCEPTION 'Add a second owner before requiring independent approval'; END IF;
 UPDATE companies SET approval_required=required WHERE id=c;
END $$;
REVOKE ALL ON FUNCTION set_approval_policy(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_approval_policy(uuid,boolean) TO tala_app;

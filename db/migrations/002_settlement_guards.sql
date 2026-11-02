-- PostgreSQL row locks require UPDATE privilege on at least one column.
-- This column grant permits locking; the immutable trigger still rejects all updates.
GRANT UPDATE(id) ON documents TO tala_app;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY own_membership ON memberships USING(user_id=nullif(current_setting('app.user',true),'')::uuid);
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY own_tenant ON tenants USING(EXISTS(SELECT 1 FROM memberships m WHERE m.tenant_id=id));
CREATE FUNCTION validate_settlement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d documents; paid numeric;
BEGIN
 SELECT * INTO d FROM documents WHERE id=NEW.document_id FOR UPDATE;
 IF d.id IS NULL THEN RAISE EXCEPTION 'Document is unavailable'; END IF;
 IF NEW.business_date<d.business_date THEN RAISE EXCEPTION 'Payment predates document'; END IF;
 SELECT coalesce(sum(cash+withholding),0) INTO paid FROM payments WHERE document_id=d.id;
 IF paid+NEW.cash+NEW.withholding>d.gross THEN RAISE EXCEPTION 'Payment exceeds outstanding balance'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER prevent_overpayment BEFORE INSERT ON payments FOR EACH ROW EXECUTE FUNCTION validate_settlement();
ALTER TABLE documents ADD CONSTRAINT exact_tax CHECK(tax=round(net*tax_rate,2));

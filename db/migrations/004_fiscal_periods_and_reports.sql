-- New periods require owner authorization; existing periods cannot be resized.
REVOKE INSERT ON periods FROM tala_app;
CREATE FUNCTION add_fiscal_period(c uuid, period_name text, begins date, finishes date) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t uuid; p uuid:=gen_random_uuid();
BEGIN
 t:=require_company_owner(c);
 IF length(trim(period_name))<2 OR length(period_name)>80 OR begins IS NULL OR finishes IS NULL OR begins>finishes THEN RAISE EXCEPTION 'Invalid fiscal period'; END IF;
 INSERT INTO periods(id,tenant_id,company_id,name,starts,ends) VALUES(p,t,c,trim(period_name),begins,finishes);
 RETURN p;
END $$;
REVOKE ALL ON FUNCTION add_fiscal_period(uuid,text,date,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION add_fiscal_period(uuid,text,date,date) TO tala_app;
CREATE INDEX journals_company_business_date ON journals(tenant_id,company_id,business_date,id) WHERE status='posted';
CREATE INDEX payments_company_business_date ON payments(tenant_id,company_id,business_date,document_id);
CREATE INDEX documents_company_business_date ON documents(tenant_id,company_id,business_date,id);

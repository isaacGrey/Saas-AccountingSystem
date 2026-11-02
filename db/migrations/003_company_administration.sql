-- Privileged helpers expose only explicitly authorized company operations.
CREATE FUNCTION require_company_owner(c uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t uuid;
BEGIN
 SELECT tenant_id INTO t FROM companies WHERE id=c FOR UPDATE;
 IF t IS NULL OR NOT EXISTS(SELECT 1 FROM memberships WHERE company_id=c AND user_id=nullif(current_setting('app.user',true),'')::uuid AND role='owner') THEN
 RAISE EXCEPTION 'Company owner permission required' USING ERRCODE='42501'; END IF;
 RETURN t;
END $$;
REVOKE ALL ON FUNCTION require_company_owner(uuid) FROM PUBLIC;
CREATE FUNCTION company_members(c uuid) RETURNS TABLE(id uuid,name text,email text,role text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM require_company_owner(c);
 RETURN QUERY SELECT u.id,u.name,u.email,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.company_id=c ORDER BY u.name,u.id;
END $$;
CREATE FUNCTION set_company_member(c uuid, member_email text, new_role text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t uuid; target uuid; actor uuid:=nullif(current_setting('app.user',true),'')::uuid;
BEGIN
 t:=require_company_owner(c);
 IF new_role NOT IN ('owner','accountant','auditor','remove') THEN RAISE EXCEPTION 'Invalid role'; END IF;
 SELECT id INTO target FROM users WHERE email=lower(trim(member_email));
 IF target IS NULL THEN RAISE EXCEPTION 'User must first register an account'; END IF;
 IF target=actor THEN RAISE EXCEPTION 'You cannot change your own owner access'; END IF;
 IF new_role='remove' THEN
 DELETE FROM memberships WHERE user_id=target AND company_id=c;
 IF NOT FOUND THEN RAISE EXCEPTION 'Membership not found'; END IF;
 ELSE
 INSERT INTO memberships(user_id,tenant_id,company_id,role) VALUES(target,t,c,new_role)
 ON CONFLICT(user_id,company_id) DO UPDATE SET role=EXCLUDED.role;
 END IF;
 RETURN target;
END $$;
CREATE FUNCTION add_legal_company(source_company uuid, company_name text, start_date date) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t uuid; c uuid:=gen_random_uuid(); actor uuid:=nullif(current_setting('app.user',true),'')::uuid;
BEGIN
 t:=require_company_owner(source_company);
 IF length(trim(company_name))<2 OR length(company_name)>160 OR start_date IS NULL THEN RAISE EXCEPTION 'Invalid company details'; END IF;
 INSERT INTO companies(id,tenant_id,name) VALUES(c,t,trim(company_name));
 INSERT INTO memberships VALUES(actor,t,c,'owner');
 INSERT INTO branches VALUES(gen_random_uuid(),t,c,'Main branch');
 INSERT INTO periods(id,tenant_id,company_id,name,starts,ends) VALUES(gen_random_uuid(),t,c,'FY '||extract(year from start_date),date_trunc('year',start_date)::date,(date_trunc('year',start_date)+interval '1 year - 1 day')::date);
 INSERT INTO accounts(id,tenant_id,company_id,code,name,kind) SELECT gen_random_uuid(),t,c,code,name,kind FROM accounts WHERE company_id=source_company;
 INSERT INTO tax_rules(id,tenant_id,company_id,code,name,rate,effective_from) SELECT gen_random_uuid(),t,c,code,name,rate,start_date FROM tax_rules WHERE company_id=source_company;
 RETURN c;
END $$;
REVOKE ALL ON FUNCTION company_members(uuid),set_company_member(uuid,text,text),add_legal_company(uuid,text,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION company_members(uuid),set_company_member(uuid,text,text),add_legal_company(uuid,text,date) TO tala_app;

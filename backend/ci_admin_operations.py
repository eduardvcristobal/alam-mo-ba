"""Disposable PostgreSQL certification of curriculum, learner and settings governance."""
import hashlib,json,secrets,subprocess,uuid
from urllib.request import Request,urlopen
from urllib.error import HTTPError
BASE="http://127.0.0.1:8080/api/v1"
def psql(q,collect=False):
 r=subprocess.run(["psql","-At","-v","ON_ERROR_STOP=1","-h","localhost","-U","alammoba","-d","alammoba","-c",q],check=True,stdout=subprocess.PIPE,text=True)
 return r.stdout.strip() if collect else None
def call(path,method="GET",token=None,body=None):
 headers={"Content-Type":"application/json"}
 if token:headers["Authorization"]="Bearer "+token
 try:
  with urlopen(Request(BASE+path,method=method,headers=headers,
     data=None if body is None else json.dumps(body).encode()),timeout=10) as r:
   data=r.read();return r.status,json.loads(data) if data else None
 except HTTPError as e:return e.code,None
def account(role=None):
 ident=str(uuid.uuid4());session=str(uuid.uuid4());token=secrets.token_urlsafe(32)
 digest=hashlib.sha256(token.encode()).hexdigest()
 psql(f"INSERT INTO learning_account(id) VALUES ('{ident}')")
 psql(f"INSERT INTO learning_account_session(id,account_id,token_sha256,expires_at) VALUES ('{session}','{ident}','{digest}',NOW()+INTERVAL '1 hour')")
 if role:psql(f"INSERT INTO platform_admin_role(account_id,role) VALUES ('{ident}','{role}')")
 return ident,token
super_id,super_token=account("SUPER_ADMIN")
content_id,content_token=account("CONTENT_ADMIN")
editor_id,editor_token=account("EDITOR")
support_id,support_token=account("SUPPORT")
learner_id,learner_token=account()
code,_=call("/admin/curriculum/subjects")
assert code==401,code
code,subjects=call("/admin/curriculum/subjects",token=support_token)
assert code==200 and len(subjects)>=6,(code,subjects)
code,_=call("/admin/curriculum/topics","POST",editor_token,
 {"subject":"Science","grade":7,"en":"Water and Matter","fil":"Tubig at Materya","active":True})
assert code==403,code
code,topic=call("/admin/curriculum/topics","POST",content_token,
 {"subject":"Science","grade":7,"en":"Water and Matter","fil":"Tubig at Materya","active":True})
assert code==200,(code,topic)
tid=topic["id"]
code,topics=call("/admin/curriculum/topics?subject=Science&grade=7",token=support_token)
assert code==200 and any(x["id"]==tid for x in topics),(code,topics)

fact={"key":"ci-curriculum-"+uuid.uuid4().hex[:9],"subject":"Science","emoji":"🔬",
 "en":"CI science fact","fil":"CI kaalaman sa agham","student":True,"grade":7,"explore":True,
 "sourceTitle":"CI source","sourceUrl":"https://example.org/ci-curriculum"}
code,created=call("/admin/facts","POST",editor_token,fact)
assert code==200,(code,created)
fid=created["id"]
code,assigned=call(f"/admin/curriculum/facts/{fid}/topic","PUT",editor_token,{"topicId":tid})
assert code==200 and assigned["topicId"]==tid,(code,assigned)
assert psql(f"SELECT topic_id FROM content_fact WHERE id={fid}",True)==str(tid)

code,accounts=call("/admin/learners",token=support_token)
assert code==200 and any(x["id"]==learner_id for x in accounts),(code,accounts)
assert "email" not in str(accounts).lower() and "provider_subject" not in str(accounts).lower()
code,_=call("/admin/roles/change","POST",support_token,
 {"accountId":learner_id,"role":"REVIEWER","action":"GRANT","reason":"CI role authorization check"})
assert code==403,code
code,grant=call("/admin/roles/change","POST",super_token,
 {"accountId":learner_id,"role":"REVIEWER","action":"GRANT","reason":"CI role grant"})
assert code==200 and grant["changed"],(code,grant)
code,role_accounts=call("/admin/roles/accounts",token=super_token)
assert code==200 and any(x["accountId"]==learner_id and "REVIEWER" in x["roles"] for x in role_accounts),(code,role_accounts)
code,_=call("/admin/roles/change","POST",super_token,
 {"accountId":super_id,"role":"SUPER_ADMIN","action":"REVOKE","reason":"CI self protection"})
assert code==409,code
code,revoked=call("/admin/roles/change","POST",super_token,
 {"accountId":learner_id,"role":"REVIEWER","action":"REVOKE","reason":"CI role revoke"})
assert code==200 and revoked["changed"],(code,revoked)
assert "GRANT_PLATFORM_ROLE" in psql("SELECT action FROM platform_operator_audit WHERE target_id='"+learner_id+"' ORDER BY id DESC LIMIT 2",True)
code,_=call(f"/admin/learners/{learner_id}/status","PUT",editor_token,
 {"status":"DISABLED","reason":"Synthetic CI suspension"})
assert code==403,code
code,disabled=call(f"/admin/learners/{learner_id}/status","PUT",super_token,
 {"status":"DISABLED","reason":"Synthetic CI suspension"})
assert code==200 and disabled["status"]=="DISABLED",(code,disabled)
code,_=call("/account/me",token=learner_token)
assert code==401,code
code,_=call(f"/admin/learners/{super_id}/status","PUT",super_token,
 {"status":"DISABLED","reason":"Not allowed self-disable"})
assert code==409,code
code,_=call(f"/admin/learners/{learner_id}/status","PUT",super_token,
 {"status":"ACTIVE","reason":"Synthetic CI restoration"})
assert code==200,code

code,metrics=call("/admin/analytics",token=support_token)
assert code==200 and metrics["registeredAccounts"]>=5 and "factsBySubject" in metrics,(code,metrics)
assert "accountId" not in str(metrics)

code,settings=call("/admin/platform/settings",token=support_token)
assert code==200 and any(x["key"]=="content_submissions_enabled" and x["value"] for x in settings),(code,settings)
code,_=call("/admin/platform/settings/content_submissions_enabled","PUT",editor_token,
 {"value":False,"reason":"CI disable"})
assert code==403,code
code,_=call("/admin/platform/settings/content_submissions_enabled","PUT",super_token,
 {"value":False,"reason":"CI pause new submissions"})
assert code==200,code
code,_=call("/admin/facts","POST",editor_token,{**fact,"key":"ci-paused-"+uuid.uuid4().hex[:7]})
assert code==409,code
code,_=call("/admin/platform/settings/content_submissions_enabled","PUT",super_token,
 {"value":True,"reason":"CI restore submissions"})
assert code==200,code
code,events=call("/admin/platform/audit",token=content_token)
assert code==200 and any(x["action"]=="CHANGE_PLATFORM_SETTING" for x in events),(code,events)
assert any(x["action"]=="SET_LEARNER_STATUS" for x in events),events
code,_=call("/admin/platform/audit",token=support_token)
assert code==403,code
print("PASS: curriculum taxonomy, protected fact links, learner privacy/status enforcement, aggregate analytics, audited settings and submission pause")

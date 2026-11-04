"""Disposable CI-only full editorial publication / separation-of-duties checks."""
import hashlib,json,secrets,subprocess,uuid
from urllib.request import Request,urlopen
from urllib.error import HTTPError
BASE="http://127.0.0.1:8080/api/v1"
def sql(s):
 subprocess.run(["psql","-v","ON_ERROR_STOP=1","-h","localhost","-U","alammoba","-d","alammoba","-c",s],check=True,stdout=subprocess.DEVNULL)
def call(path,method="GET",token=None,body=None):
 headers={"Content-Type":"application/json"}
 if token:headers["Authorization"]="Bearer "+token
 data=None if body is None else json.dumps(body).encode()
 try:
  with urlopen(Request(BASE+path,method=method,data=data,headers=headers),timeout=10) as res:
   raw=res.read()
   return res.status,json.loads(raw) if raw else None
 except HTTPError as error:return error.code,None

def account(role=None):
 ident=str(uuid.uuid4());sid=str(uuid.uuid4());token=secrets.token_urlsafe(32)
 hash_value=hashlib.sha256(token.encode()).hexdigest()
 sql(f"INSERT INTO learning_account(id) VALUES ('{ident}')")
 sql(f"""INSERT INTO learning_account_session(id,account_id,token_sha256,expires_at)
 VALUES ('{sid}','{ident}','{hash_value}',NOW()+INTERVAL '1 hour')""")
 if role:sql(f"INSERT INTO platform_admin_role(account_id,role) VALUES ('{ident}','{role}')")
 return token

learner=account();editor=account("EDITOR");reviewer=account("REVIEWER");publisher=account("CONTENT_ADMIN");support=account("SUPPORT")
code,_=call("/admin/dashboard")
assert code==401,code
code,_=call("/admin/dashboard",token=learner)
assert code==403,code
code,summary=call("/admin/dashboard",token=support)
assert code==200 and "facts" in summary,(code,summary)
fact={"key":"ci-admin-fact-"+uuid.uuid4().hex[:8],"subject":"Science","emoji":"🔬",
      "en":"CI verified educational fact","fil":"CI beripikadong kaalaman",
      "explore":True,"grades":[7],"sourceTitle":"CI synthetic source","sourceUrl":"https://example.org/ci-source"}
code,_=call("/admin/facts","POST",support,fact)
assert code==403,code
code,result=call("/admin/facts","POST",editor,fact)
assert code==200 and result["status"]=="DRAFT",(code,result)
id=result["id"]
code,detail=call(f"/admin/facts/{id}",token=editor)
assert code==200 and len(detail["sources"])==1 and not detail["sources"][0]["checked"],(code,detail)
code,public=call("/content/facts?mode=explore")
assert code==200 and all(f["id"]!=id for f in public["items"]),public
code,_=call(f"/admin/review/facts/{id}","POST",editor,{"action":"publish","sourceChecked":True})
assert code==403,code
code,_=call(f"/admin/review/facts/{id}","POST",editor,{"action":"submit","sourceChecked":False})
assert code==200,code
code,_=call(f"/admin/review/facts/{id}","POST",editor,{"action":"approve","sourceChecked":True})
assert code==403,code
code,_=call(f"/admin/review/facts/{id}","POST",reviewer,{"action":"approve","sourceChecked":False})
assert code==409,code
code,approved=call(f"/admin/review/facts/{id}","POST",reviewer,{"action":"approve","sourceChecked":True,"note":"Independent source verified"})
assert code==200 and approved["status"]=="APPROVED",(code,approved)
code,public=call("/content/facts?mode=explore")
assert code==200 and all(f["id"]!=id for f in public["items"]),public
code,published=call(f"/admin/review/facts/{id}","POST",publisher,{"action":"publish","sourceChecked":False})
assert code==200 and published["status"]=="PUBLISHED",(code,published)
code,public=call("/content/facts?mode=explore")
assert code==200 and any(f["id"]==id for f in public["items"]),public

quiz={"factId":id,"en":"Choose the right answer","fil":"Piliin ang tamang sagot",
      "explanationEn":"The correct answer is one","explanationFil":"Ang tamang sagot ay isa",
      "choices":[{"en":"One","fil":"Isa","correct":True},
                 {"en":"Two","fil":"Dalawa","correct":False},
                 {"en":"Three","fil":"Tatlo","correct":False}]}
code,result=call("/admin/quizzes","POST",editor,quiz)
assert code==200 and result["status"]=="DRAFT",(code,result)
qid=result["id"]
code,_=call(f"/admin/review/quizzes/{qid}","POST",editor,{"action":"submit"})
assert code==200,code
code,approved=call(f"/admin/review/quizzes/{qid}","POST",reviewer,{"action":"approve"})
assert code==200 and approved["status"]=="APPROVED",(code,approved)
code,_=call(f"/admin/review/quizzes/{qid}","POST",publisher,{"action":"publish"})
assert code==200,code
code,q=call("/content/questions?mode=student&grade=7")
assert code==200 and any(item["id"]==qid for item in q["items"]),q
assert all("correct" not in option for item in q["items"] for option in item["options"]),q
code,audit=call("/admin/review/audit",token=reviewer)
assert code==200 and any(item["action"]=="publish" for item in audit),audit
code,retired=call(f"/admin/review/quizzes/{qid}","POST",publisher,{"action":"retire"})
assert code==200 and retired["status"]=="RETIRED",(code,retired)
print("PASS: live admin RBAC, drafts hidden, independent checked-source review, publication, quiz option confidentiality, editorial audit")

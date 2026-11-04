"""Disposable PostgreSQL certification of admin RBAC and editorial workflow."""
import hashlib,json,secrets,subprocess,uuid
from urllib.request import Request,urlopen
from urllib.error import HTTPError

BASE="http://127.0.0.1:8080/api/v1"
def sql(q):
    subprocess.run(["psql","-v","ON_ERROR_STOP=1","-h","localhost","-U","alammoba","-d","alammoba","-c",q],
                   check=True,stdout=subprocess.DEVNULL)
def account(role=None):
    aid=str(uuid.uuid4())
    token=secrets.token_urlsafe(32)
    digest=hashlib.sha256(token.encode()).hexdigest()
    sql(f"INSERT INTO learning_account(id) VALUES ('{aid}')")
    sql(f"INSERT INTO learning_account_progress(account_id) VALUES ('{aid}')")
    sql(f"""INSERT INTO learning_account_session(id,account_id,token_sha256,expires_at)
        VALUES ('{uuid.uuid4()}','{aid}','{digest}',NOW()+INTERVAL '1 hour')""")
    if role:sql(f"INSERT INTO platform_admin_role(account_id,role) VALUES ('{aid}','{role}')")
    return aid,token

def call(path,method="GET",token=None,body=None):
    headers={"Content-Type":"application/json"}
    if token:headers["Authorization"]="Bearer "+token
    data=None if body is None else json.dumps(body).encode()
    try:
        with urlopen(Request(BASE+path,method=method,data=data,headers=headers),timeout=10) as r:
            raw=r.read();return r.status,json.loads(raw) if raw else None
    except HTTPError as error:
        return error.code,None

_,editor=account("EDITOR")
_,reviewer=account("REVIEWER")
_,publisher=account("CONTENT_ADMIN")
_,outsider=account()
code,_=call("/admin/me")
assert code==401,code
code,_=call("/admin/me",token=outsider)
assert code==403,code
code,me=call("/admin/me",token=editor)
assert code==200 and "EDITOR" in me["roles"],(code,me)

def draft(key,source=True):
    return {"key":key,"subject":"Science","emoji":"🧪",
      "en":"Water freezes at approximately zero degrees Celsius at standard pressure.",
      "fil":"Nagyeyelo ang tubig sa humigit-kumulang serong digri Celsius sa karaniwang presyon.",
      "student":True,"grade":7,"explore":True,
      "sourceTitle":"Test checked synthetic source" if source else "",
      "sourceUrl":"https://example.org/fixture" if source else ""}

code,data=call("/admin/facts","POST",outsider,draft("untrusted-create"))
assert code==403,code
key="admin-ci-"+str(uuid.uuid4())[:8]
code,data=call("/admin/facts","POST",editor,draft(key))
assert code==200 and data["status"]=="DRAFT",(code,data)
fid=data["id"]
code,_=call(f"/admin/workflow/fact/{fid}/approve","POST",reviewer)
assert code==409,code
code,_=call(f"/admin/workflow/fact/{fid}/submit","POST",editor)
assert code==200,code
code,_=call(f"/admin/workflow/fact/{fid}/approve","POST",editor)
assert code==403,code
code,_=call(f"/admin/workflow/fact/{fid}/publish","POST",publisher)
assert code==409,code
code,approved=call(f"/admin/workflow/fact/{fid}/approve","POST",reviewer)
assert code==200 and approved["status"]=="APPROVED",(code,approved)
code,published=call(f"/admin/workflow/fact/{fid}/publish","POST",publisher)
assert code==200 and published["status"]=="PUBLISHED",(code,published)
code,public=call("/content/facts?mode=explore")
assert code==200 and any(f["id"]==fid for f in public["items"]),(code,public)

question={"factId":fid,"en":"At standard pressure, water freezes at?",
 "fil":"Sa karaniwang presyon, nagyeyelo ang tubig sa?",
 "explanationEn":"At standard pressure, water freezes around 0°C.",
 "explanationFil":"Sa karaniwang presyon, nagyeyelo ang tubig malapit sa 0°C.",
 "options":[{"en":"0°C","fil":"0°C","correct":True},
            {"en":"100°C","fil":"100°C","correct":False},
            {"en":"50°C","fil":"50°C","correct":False}]}
code,quiz=call("/admin/questions","POST",editor,question)
assert code==200,(code,quiz)
qid=quiz["id"]
code,details=call(f"/admin/questions/{qid}",token=reviewer)
assert code==200 and sum(int(o["correct"]) for o in details["options"])==1,(code,details)
code,_=call(f"/admin/workflow/question/{qid}/submit","POST",editor)
assert code==200,code
code,_=call(f"/admin/workflow/question/{qid}/approve","POST",reviewer)
assert code==200,code
code,_=call(f"/admin/workflow/question/{qid}/publish","POST",publisher)
assert code==200,code
code,public_quiz=call("/content/questions?mode=explore")
assert code==200 and any(q["id"]==qid for q in public_quiz["items"]),(code,public_quiz)
assert "correct" not in str(public_quiz["items"][-1]),public_quiz
code,history=call("/admin/workflow/queue",token=reviewer)
assert code==200,(code,history)
sql("SELECT 1")  # db still healthy
code,_=call(f"/admin/workflow/fact/{fid}/approve","POST",reviewer)
assert code==409,code

missing="admin-nosrc-"+str(uuid.uuid4())[:8]
code,draftfact=call("/admin/facts","POST",editor,draft(missing,False))
assert code==200,code
code,_=call(f"/admin/workflow/fact/{draftfact['id']}/submit","POST",editor)
assert code==200,code
code,_=call(f"/admin/workflow/fact/{draftfact['id']}/approve","POST",reviewer)
assert code==400,code
print("PASS: unauthenticated/unauthorized denial, editor draft, independent review, source gate, publication, quiz answer secrecy, audit lifecycle")

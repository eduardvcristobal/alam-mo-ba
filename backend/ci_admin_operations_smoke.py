"""CI-only live PostgreSQL checks for M1.3 curriculum, privacy, learner RBAC and settings."""
import hashlib,json,secrets,subprocess,uuid
from urllib.request import Request,urlopen
from urllib.error import HTTPError
ROOT="http://127.0.0.1:8080/api/v1"
def sql(query):
    subprocess.run(["psql","-v","ON_ERROR_STOP=1","-h","localhost","-U","alammoba","-d","alammoba","-c",query],
                   check=True,stdout=subprocess.DEVNULL)
def account(role=None):
    aid=str(uuid.uuid4());token=secrets.token_urlsafe(32)
    digest=hashlib.sha256(token.encode()).hexdigest()
    sql(f"INSERT INTO learning_account(id) VALUES ('{aid}')")
    sql(f"INSERT INTO learning_account_progress(account_id) VALUES ('{aid}')")
    sql(f"""INSERT INTO learning_account_session(id,account_id,token_sha256,expires_at)
      VALUES('{uuid.uuid4()}','{aid}','{digest}',NOW()+INTERVAL '1 hour')""")
    if role:sql(f"INSERT INTO platform_admin_role(account_id,role) VALUES ('{aid}','{role}')")
    return aid,token
def call(path,method="GET",token=None,body=None):
    headers={"Content-Type":"application/json"}
    if token:headers["Authorization"]="Bearer "+token
    data=None if body is None else json.dumps(body).encode()
    try:
        with urlopen(Request(ROOT+path,method=method,headers=headers,data=data),timeout=10) as r:
            b=r.read();return r.status,json.loads(b) if b else None
    except HTTPError as e:return e.code,None

super_id,super_token=account("SUPER_ADMIN")
_,editor=account("EDITOR")
_,support=account("SUPPORT")
learner_id,learner=account()
code,_=call("/admin/operations/subjects")
assert code==401,code
code,_=call("/admin/operations/subjects",token=learner)
assert code==403,code
code,subjects=call("/admin/operations/subjects",token=editor)
assert code==200 and len(subjects)>=6,(code,subjects)
code,topic=call("/admin/operations/topics","POST",editor,
    {"subject":"Science","grade":7,"en":"CI topic","fil":"Paksa ng CI"})
assert code==200 and topic["created"],(code,topic)
topic_id=topic["id"]
fact_input={"key":"topic-ci-"+str(uuid.uuid4())[:8],"subject":"Science","emoji":"🧪",
            "en":"Test curriculum content in Science.","fil":"Pagsubok sa paksang Agham.",
            "student":True,"grade":7,"explore":False,
            "sourceTitle":"Synthetic source","sourceUrl":"https://example.org/fixture"}
code,fact=call("/admin/facts","POST",editor,fact_input)
assert code==200,(code,fact)
code,mapping=call(f"/admin/operations/topics/assign/{fact['id']}","PUT",editor,{"topicId":topic_id})
assert code==200 and mapping["topicId"]==topic_id,(code,mapping)
code,mappings=call("/admin/operations/topics/assignments",token=editor)
assert code==200 and any(m["factId"]==fact["id"] for m in mappings),(code,mappings)
code,_=call(f"/admin/workflow/fact/{fact['id']}/submit","POST",editor)
assert code==200,code
code,_=call(f"/admin/operations/topics/assign/{fact['id']}","PUT",editor,{"topicId":topic_id})
assert code==400,code
code,_=call("/admin/operations/topics","POST",editor,
    {"subject":"Science","grade":17,"en":"Invalid","fil":"Hindi tama"})
assert code==400,code
code,_=call(f"/admin/operations/topics/{topic_id}/enabled","PUT",editor,{"enabled":False})
assert code==403,code
code,changed=call(f"/admin/operations/topics/{topic_id}/enabled","PUT",super_token,{"enabled":False})
assert code==200 and not changed["enabled"],(code,changed)
code,roster=call("/admin/operations/learners",token=support)
assert code==200 and any(x["accountId"]==learner_id for x in roster),(code,roster)
assert all("email" not in x and "provider" not in x for x in roster)
code,_=call("/admin/operations/learners",token=editor)
assert code==403,code
code,request=call("/account/privacy-requests","POST",learner,{"type":"EXPORT"})
assert code==200 and request["status"]=="OPEN",(code,request)
code,_=call("/account/privacy-requests","POST",learner,{"type":"EXPORT"})
assert code==409,code
code,own=call("/account/privacy-requests",token=learner)
assert code==200 and len(own)==1,(code,own)
code,queue=call("/admin/operations/privacy",token=support)
assert code==200 and any(r["id"]==request["id"] for r in queue),(code,queue)
code,_=call(f"/admin/operations/privacy/{request['id']}/review","POST",support)
assert code==403,code
code,reviewed=call(f"/admin/operations/privacy/{request['id']}/review","POST",super_token)
assert code==200 and reviewed["status"]=="IN_REVIEW",(code,reviewed)
code,analytics=call("/admin/operations/analytics",token=support)
assert code==200 and analytics["learners"]>=4 and analytics["pendingPrivacy"]>=1,(code,analytics)
code,_=call("/admin/operations/settings",token=support)
assert code==403,code
code,_=call("/admin/operations/settings/admin_registration","PUT",super_token,{"value":"true"})
assert code==400,code
code,setting=call("/admin/operations/settings/daily_challenge_enabled","PUT",super_token,{"value":"false"})
assert code==200 and setting["value"]=="false",(code,setting)
code,_=call(f"/admin/operations/learners/{super_id}/suspend","POST",super_token)
assert code==403,code
code,suspended=call(f"/admin/operations/learners/{learner_id}/suspend","POST",super_token)
assert code==200 and suspended["status"]=="DISABLED",(code,suspended)
code,_=call("/account/me",token=learner)
assert code==401,code
code,reopened=call(f"/admin/operations/learners/{learner_id}/reactivate","POST",super_token)
assert code==200 and reopened["status"]=="ACTIVE",(code,reopened)
code,history=call("/admin/operations/audit",token=super_token)
assert code==200 and len(history)>=4,(code,history)
print("PASS: curriculum topics, role authorization, privacy request ownership, safe aggregates, settings whitelist, learner suspend and audit")

"""Disposable CI-only privacy export, recent-session deletion and guest erasure checks."""
import hashlib,json,secrets,subprocess,uuid
from urllib.request import Request,urlopen
from urllib.error import HTTPError
API="http://127.0.0.1:8080/api/v1"
def sql(q):
    subprocess.run(["psql","-v","ON_ERROR_STOP=1","-h","localhost",
                    "-U","alammoba","-d","alammoba","-c",q],check=True,stdout=subprocess.DEVNULL)
def call(path,method="GET",token=None,body=None):
    headers={"Content-Type":"application/json"}
    if token:headers["Authorization"]="Bearer "+token
    data=None if body is None else json.dumps(body).encode()
    try:
        with urlopen(Request(API+path,method=method,data=data,headers=headers),timeout=10) as r:
            raw=r.read()
            return r.status,json.loads(raw) if raw else None
    except HTTPError as e:
        return e.code,None

# Test only: setup is direct DB insertion. This is never a production account login path.
account=str(uuid.uuid4())
session=str(uuid.uuid4())
token=secrets.token_urlsafe(32)
digest=hashlib.sha256(token.encode()).hexdigest()
sql(f"INSERT INTO learning_account(id) VALUES ('{account}')")
sql(f"INSERT INTO learning_account_progress(account_id) VALUES ('{account}')")
sql(f"""INSERT INTO learning_account_session(id,account_id,token_sha256,expires_at)
         VALUES('{session}','{account}','{digest}',NOW()+INTERVAL '1 hour')""")
code,_=call("/account/export")
assert code==401,code
code,_=call("/account","DELETE",token,{"confirmation":"wrong"})
assert code==400,code
code,data=call("/account/export",token=token)
assert code==200 and data["accountId"]==account,(code,data)
assert data["version"]==0 and data["progress"]=={},data

code,guest=call("/guest/sessions","POST")
assert code==200
guest_token=guest["token"]
document={"mode":"explore","lang":"fil","grade":"7","subject":"all","count":5,
          "saved":[3],"learned":[2],"attempts":[],"streak":1,"last":"2026-11-04"}
code,_=call("/guest/progress","PUT",guest_token,{"expectedVersion":0,"state":document})
assert code==200,code
code,imported=call("/account/import-guest","POST",token,{"guestToken":guest_token})
assert code==200 and imported["state"]["saved"]==[3],(code,imported)
code,data=call("/account/export",token=token)
assert code==200 and data["progress"]["saved"]==[3],(code,data)
code,_=call("/account","DELETE",token,{"confirmation":"DELETE MY ACCOUNT"})
assert code==204,code
code,_=call("/account/me",token=token)
assert code==401,code
code,_=call("/account/export",token=token)
assert code==401,code

# Standalone guest revoke must erase both token AND data, not just deny access.
code,backup=call("/guest/sessions","POST")
assert code==200,code
code,_=call("/guest/sessions/revoke","POST",backup["token"])
assert code==204,code
code,_=call("/guest/progress",token=backup["token"])
assert code==401,code

# Account registration remains explicitly OFF until privacy acceptance.
code,ch=call("/account/google/challenge","POST")
assert code==503,(code,ch)
print("PASS: export ownership, explicit delete confirmation, imported backup cleanup, revoked guest erasure, registration default-off")

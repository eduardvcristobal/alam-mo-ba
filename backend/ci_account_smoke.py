"""CI-only registered-account ownership and guest import verification.

Creates synthetic account credentials directly in disposable CI PostgreSQL.
No user-facing bypass to Google verification exists.
"""
import hashlib
import json
import secrets
import subprocess
import uuid
from urllib.request import Request, urlopen
from urllib.error import HTTPError

API="http://127.0.0.1:8080/api/v1"
def sql(statement):
    subprocess.run(["psql","-v","ON_ERROR_STOP=1","-h","localhost",
                    "-U","alammoba","-d","alammoba","-c",statement],
                   check=True,stdout=subprocess.DEVNULL)

def call(path,method="GET",token=None,body=None):
    headers={"Content-Type":"application/json"}
    if token:headers["Authorization"]="Bearer "+token
    data=None if body is None else json.dumps(body).encode()
    try:
        with urlopen(Request(API+path,method=method,data=data,headers=headers),timeout=10) as response:
            raw=response.read()
            return response.status,json.loads(raw) if raw else None
    except HTTPError as error:
        return error.code,None

def fake_account():
    account=str(uuid.uuid4())
    sid=str(uuid.uuid4())
    token=secrets.token_urlsafe(32)
    hashed=hashlib.sha256(token.encode()).hexdigest()
    sql(f"INSERT INTO learning_account (id) VALUES ('{account}');")
    sql(f"INSERT INTO learning_account_progress (account_id) VALUES ('{account}');")
    sql(f"""INSERT INTO learning_account_session (id,account_id,token_sha256,expires_at)
            VALUES ('{sid}','{account}','{hashed}',NOW()+INTERVAL '1 hour');""")
    return account,token

a_id,a_token=fake_account()
b_id,b_token=fake_account()
code,_=call("/account/progress")
assert code==401,code
code,state=call("/account/progress",token=a_token)
assert code==200 and state["version"]==0 and state["state"]=={},(code,state)
code,guest=call("/guest/sessions","POST")
assert code==200,code
guest_token=guest["token"]
document={"mode":"student","lang":"fil","grade":"7","subject":"Science",
          "count":5,"saved":[1,2],"learned":[2],"streak":1,"last":"2026-11-04",
          "attempts":[{"score":1,"total":2,"date":"2026-11-04"}]}
code,guest_state=call("/guest/progress","PUT",guest_token,
                     {"expectedVersion":0,"state":document})
assert code==200 and guest_state["version"]==1,(code,guest_state)
code,_=call("/account/import-guest","POST",a_token,{"guestToken":"invalid"})
assert code==400,code
code,imported=call("/account/import-guest","POST",a_token,{"guestToken":guest_token})
assert code==200 and imported["version"]==1,(code,imported)
assert imported["state"]["saved"]==[1,2],imported
code,again=call("/account/import-guest","POST",a_token,{"guestToken":guest_token})
assert code==200 and again["version"]==1,(code,again)
code,_=call("/account/import-guest","POST",b_token,{"guestToken":guest_token})
assert code==409,code
code,_=call("/guest/progress",token=guest_token)
assert code==401,code
code,b_state=call("/account/progress",token=b_token)
assert code==200 and b_state["state"]=={},(code,b_state)
code,_=call("/account/progress","PUT",a_token,{"expectedVersion":0,"state":document})
assert code==409,code
code,updated=call("/account/progress","PUT",a_token,{"expectedVersion":1,"state":document})
assert code==200 and updated["version"]==2,(code,updated)
code,_=call("/account/logout","POST",a_token)
assert code==204,code
code,_=call("/account/me",token=a_token)
assert code==401,code
code,still=call("/account/me",token=b_token)
assert code==200 and still["accountId"]==b_id,(code,still)
print("PASS: account session ownership, one-time guest import, idempotence, cross-account rejection, version conflict, logout")

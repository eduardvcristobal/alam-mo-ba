"""Live PostgreSQL guest capability isolation and optimistic locking smoke tests."""
import json
from urllib.request import Request, urlopen
from urllib.error import HTTPError

BASE="http://127.0.0.1:8080/api/v1/guest"
def call(path,method="GET",token=None,body=None):
    headers={"Content-Type":"application/json"}
    if token:headers["Authorization"]="Bearer "+token
    payload=None if body is None else json.dumps(body).encode()
    try:
        with urlopen(Request(BASE+path,method=method,data=payload,headers=headers),timeout=10) as r:
            raw=r.read()
            return r.status,json.loads(raw) if raw else None
    except HTTPError as e:
        return e.code,None
code,first=call("/sessions","POST")
assert code==200 and len(first["token"])==43,(code,first)
code,second=call("/sessions","POST")
assert code==200 and first["token"]!=second["token"]
token1=first["token"]
token2=second["token"]
code,unauthorized=call("/progress")
assert code==401,code
code,state=call("/progress",token=token1)
assert code==200 and state["version"]==0 and state["state"]=={},(code,state)
doc={"mode":"student","lang":"en","grade":"7","subject":"Science","count":5,
     "saved":[1],"learned":[2],"streak":1,"last":"2026-11-04","attempts":[]}
code,new=call("/progress","PUT",token1,{"expectedVersion":0,"state":doc})
assert code==200 and new["version"]==1,(code,new)
code,other=call("/progress",token=token2)
assert code==200 and other["state"]=={} and other["version"]==0,(code,other)
code,conflict=call("/progress","PUT",token1,{"expectedVersion":0,"state":doc})
assert code==409,code
code,invalid=call("/progress","PUT",token1,{"expectedVersion":1,"state":{"admin":True}})
assert code==400,code
code,other=call("/progress","PUT",token2,{"expectedVersion":0,"state":doc})
assert code==200 and other["version"]==1
code,_=call("/sessions/revoke","POST",token1)
assert code==204,code
code,_=call("/progress",token=token1)
assert code==401,code
code,other=call("/progress",token=token2)
assert code==200 and other["version"]==1,(code,other)
print("PASS: token isolation, authorization, optimistic locking, validation, revocation, independent guest progress")

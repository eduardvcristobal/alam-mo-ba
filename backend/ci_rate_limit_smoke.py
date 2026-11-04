"""Live smoke checks for guest-session and progress-write HTTP 429 limits."""
import json
from urllib.request import Request,urlopen
from urllib.error import HTTPError

BASE="http://127.0.0.1:8080/api/v1/guest"
def call(path,method="GET",token=None,body=None):
    headers={"Content-Type":"application/json"}
    if token:headers["Authorization"]="Bearer "+token
    payload=None if body is None else json.dumps(body).encode()
    try:
        with urlopen(Request(BASE+path,method=method,data=payload,headers=headers),timeout=10) as response:
            raw=response.read()
            return response.status,json.loads(raw) if raw else None,dict(response.headers)
    except HTTPError as error:
        raw=error.read()
        return error.code,json.loads(raw) if raw else None,dict(error.headers)

# Other PostgreSQL smoke scripts consume five of the eight CI-only session slots.
for _ in range(3):
    code,session,_=call("/sessions","POST")
    assert code==200 and len(session["token"])==43,(code,session)
code,_,headers=call("/sessions","POST")
assert code==429 and int(headers.get("Retry-After","0"))>0,(code,headers)

# Existing smoke scripts consume six of the eight CI-only write slots.
token=session["token"]
document={"mode":"explore","lang":"en","grade":"7","subject":"all","count":5,
          "saved":[],"learned":[],"streak":0,"last":"","attempts":[]}
for version in range(2):
    code,state,_=call("/progress","PUT",token,{"expectedVersion":version,"state":document})
    assert code==200 and state["version"]==version+1,(code,state)
code,_,headers=call("/progress","PUT",token,{"expectedVersion":2,"state":document})
assert code==429 and int(headers.get("Retry-After","0"))>0,(code,headers)
print("PASS: guest session creation and progress writes return bounded HTTP 429 responses with Retry-After")

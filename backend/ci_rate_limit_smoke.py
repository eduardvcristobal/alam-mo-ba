"""Exercise SQL-backed rate limits on disposable CI PostgreSQL.
No trusting client-provided forwarded IP headers.
"""
import json
from urllib.request import Request,urlopen
from urllib.error import HTTPError
BASE="http://127.0.0.1:8080/api/v1"
def post(path):
 try:
  with urlopen(Request(BASE+path,method="POST"),timeout=10) as r:
   return r.status
 except HTTPError as e:return e.code
# Account registration remains disabled; throttles still count requests before rejecting.
statuses=[post("/account/google/challenge") for _ in range(12)]
assert 503 in statuses[:10],statuses
assert statuses[-1]==429,statuses
# Guest creation is limited and eventually rejects requests in same window.
guest=[post("/guest/sessions") for _ in range(17)]
assert guest[0]==200,guest
assert guest[-1]==429,guest
print("PASS: Google challenges throttled, guest-session creation throttled, registration off")

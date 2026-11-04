"""CI-only end-to-end checks against a live Spring Boot + PostgreSQL service."""
import json
from urllib.request import Request, urlopen
from urllib.error import HTTPError

BASE = "http://127.0.0.1:8080/api/v1"

def call(path, data=None):
    headers = {"Content-Type": "application/json"} if data is not None else {}
    request = Request(BASE + path, headers=headers,
                      data=json.dumps(data).encode() if data is not None else None)
    try:
        with urlopen(request, timeout=10) as response:
            return response.status, json.load(response)
    except HTTPError as error:
        return error.code, None

code, facts = call("/content/facts?mode=explore")
assert code == 200 and facts["total"] == 1, (code, facts)
fact = facts["items"][0]
assert fact["translations"]["en"] == "CI test water fact"
assert fact["translations"]["fil"] == "CI test na kaalaman sa tubig"
assert "ci-unverified-water" not in str(facts) and "ci-draft-water" not in str(facts)
code, other = call("/content/facts?mode=student&grade=8")
assert code == 200 and other["total"] == 0, (code, other)
code, student = call("/content/facts?mode=student&grade=7")
assert code == 200 and student["total"] == 1, (code, student)
code, bad = call("/content/facts?mode=explore&grade=7")
assert code == 400, (code, bad)
code, questions = call("/content/questions?mode=student&grade=7")
assert code == 200 and questions["total"] == 1, (code, questions)
q = questions["items"][0]
assert len(q["options"]) == 2, q
assert all("correct" not in option for option in q["options"]), q
assert all("explanation" not in translation for translation in q["translations"].values()), q
good = q["options"][0]["id"]
wrong = q["options"][1]["id"]
payload = {"mode":"student","grade":7,"answers":[{"questionId":q["id"],"optionId":good}]}
code, score = call("/quiz/submit", payload)
assert code == 200 and score["score"] == 1 and score["total"] == 1, (code, score)
assert score["answers"][0]["correctOptionId"] == good, score
assert score["answers"][0]["explanations"]["en"] == "CI explanation for correct answer", score
payload["answers"][0]["optionId"] = wrong
code, score = call("/quiz/submit", payload)
assert code == 200 and score["score"] == 0, (code, score)
payload["grade"] = 8
code, _ = call("/quiz/submit", payload)
assert code == 400, code
payload["grade"] = 7
payload["answers"][0]["optionId"] = 999999999
code, _ = call("/quiz/submit", payload)
assert code == 400, code
print("PASS: publication, audience isolation, bilingual facts, hidden answers, server grading, invalid submissions")

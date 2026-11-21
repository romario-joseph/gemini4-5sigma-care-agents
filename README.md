# Care Agents

Romario Joseph. Built with Gemini 4 in Google AI Studio.

I built this for community health workers. Upload a photo of a handwritten intake form or a voice note, and it returns NYC services for each need, with a source for every one, plus a follow-up agent that checks back on them.

## How it works

| Step | Model | Job |
| --- | --- | --- |
| Intake Reader | Gemini 4 Hydrogen | Reads the photo, audio or text and returns needs, urgency, ZIP, language and constraints |
| Verifier | Gemini 4 Neon + Google Search | Finds nearby services and checks hours, address and eligibility |
| Self-check | Server fetch + Gemini 4 Hydrogen | Reads the source page and quotes it. Verified today, Call to confirm, or Rejected |
| Outreach | Gemini 4 Hydrogen | Drafts a text in the patient's language. A person approves before anything is sent |
| Follow-up | Gemini Managed Agent | Rechecks each referral later and drafts a check-in |
| Baseline | Gemini 4 Hydrogen, one call | Same input, no verification. For comparison |

The Verifier ranks candidates from 6,990 official NYC listings (NYC Open Data: Facilities Database, SNAP Centers, Benefits Access Centers, Homebase, Health Insurance Enrollment) by distance from the patient's ZIP, then checks the top ones live.

## Eval

20 synthetic cases with an answer key: text, handwritten photo and voice. See [eval/README.md](eval/README.md).

Run 1, Nov 21 2026, text version of all 20 cases:

| Metric | Single call | Care Agents |
| --- | --- | --- |
| Needs found (F1) | 58% | 96% |
| Urgency correct | 52% | 96% |
| Language correct | 82% (14/17) | 100% (17/17) |
| ZIP correct | 100% (18/18) | 100% (18/18) |
| Safety cases passed | 5 of 6 | 6 of 6 |
| Unsupported referrals | 12% (8/65) | 0% (0/101) |
| Verified today / Call to confirm | not checked | 22 / 79 |
| Average seconds | 6.5 | 26.9 |

What I learned: the first self-check was too strict (1 verified, 8 rejected on C01, no food option). Now it only rejects when the source contradicts the claim, and marks a referral Call to confirm when it cannot prove it online. Next: rerun with the photo and voice files, and get more pages readable so more referrals reach Verified.

## Run

```
pip install -r requirements.txt
cp .env.example .env
python eval/run_eval.py
```

## Safety

Synthetic patients only. No medical advice. A person approves before anything goes to a patient.

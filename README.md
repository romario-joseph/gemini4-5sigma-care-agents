# Care Agents: 5 Sigma

By Romario Joseph. Built at the Gemini 4 NYC Hackathon, November 21, 2026.

Community health workers spend hours turning messy intake notes into referrals, and many of those referrals point to places that are closed or that the patient cannot use. This project reads a photo of a handwritten intake form or a voice note, finds real New York City services for each need, checks them live, and proves with an eval that it does better than a single model call.

## How it works

| Step | Model | Job |
| --- | --- | --- |
| Intake Reader | Gemini 4 Hydrogen | Reads a photo, audio or text intake and returns needs, urgency, ZIP, language and constraints as JSON |
| Resource Verifier | Gemini 4 Neon with Google Search | Finds services near the patient, checks hours and eligibility, and gives a source for every referral |
| Baseline | Gemini 4 Hydrogen, one call | Same input, no verification step. Used for comparison |

The Verifier starts from 37 NYC resources: food pantries, clinics, utility help, 13 SNAP centers and 14 health insurance enrollment sites from NYC Open Data.

## Eval (Problem Statement: 5 Sigma)

20 synthetic intake cases with an answer key, including messy handwriting, a smudged ZIP, two patients on one form, noisy audio, several languages, a request for a medication dose and a prompt injection. See [eval/README.md](eval/README.md).

Results: to be added after the full run.

## Run it

```
pip install -r requirements.txt
cp .env.example .env        # add your GEMINI_API_KEY
python eval/run_eval.py
```

## Safety

- Synthetic patients only. No real patient data.
- The system never gives medical advice or medication doses.
- Every referral needs a source. A person approves before anything is sent to a patient.

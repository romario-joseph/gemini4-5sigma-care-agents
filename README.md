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

20 synthetic cases with an answer key: text, handwritten photo and voice. See [eval/README.md](eval/README.md). Final run, Nov 21 2026, in the app's Eval tab:

| Metric | Single call | Care Agents |
| --- | --- | --- |
| Needs found (F1) | 61% | 96% |
| Urgency correct | 55% | 96% |
| Language correct | 88% (15/17) | 100% (17/17) |
| ZIP correct | 100% (18/18) | 100% (18/18) |
| Safety cases passed | 5 of 6 | 6 of 6 |
| Unsupported referrals | 13% (8/60) | 0% (0/94) |
| Found in official NYC data | 72% (43/60) | 82% (77/94) |
| Address matches official record | 48% (29/60) | 81% (76/94) |
| Verified / Call to confirm / Rejected | not checked | 34 / 60 / 6 |
| Escalated to Gemini 4 Carbon | none | 3 of 20 |

Self-check stress test: 15 real NYC listings with a planted error (5 wrong hours, 5 wrong address, 5 open on a closed day) plus 5 clean controls. It caught 15 of 15 (hours corrected or rejected) and kept 5 of 5 controls.

What I learned: the first self-check was too strict (1 verified, 8 rejected on C01, no food option). Then it was too easy (0 rejected on 101). Now it rejects only when the source contradicts the claim, corrects hours from the quote, and says Call to confirm when it cannot prove a listing online.

## App

The full app is in [app/](app/): React front end and an Express server (server.ts) that holds the Gemini key and runs every model call. Built in Google AI Studio Build.

```
cd app
npm install
GEMINI_API_KEY=your_key npm run dev
```

## Run the eval script

```
pip install -r requirements.txt
cp .env.example .env
python eval/run_eval.py
```

## Safety

Synthetic patients only. No medical advice. A person approves before anything goes to a patient.

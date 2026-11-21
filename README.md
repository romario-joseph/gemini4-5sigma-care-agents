# Care Agents

Romario Joseph. Built with Gemini 4 in Google AI Studio.

I built this for community health workers. Upload a photo of a handwritten intake form or a voice note, and it returns verified NYC services for each need, with a source for every one.

## How it works

| Step | Model | Job |
| --- | --- | --- |
| Intake Reader | Gemini 4 Hydrogen | Reads the photo, audio or text and returns needs, urgency, ZIP, language and constraints |
| Verifier | Gemini 4 Neon + Google Search | Finds nearby services and checks hours and eligibility |
| Baseline | Gemini 4 Hydrogen, one call | Same input, no verification. For comparison |

The Verifier starts from 37 NYC resources, including SNAP centers and insurance enrollment sites from NYC Open Data.

## Eval

20 synthetic cases with an answer key. See [eval/README.md](eval/README.md).

Results: coming after the full run.

## Run

```
pip install -r requirements.txt
cp .env.example .env
python eval/run_eval.py
```

## Safety

Synthetic patients only. No medical advice. A person approves before anything goes to a patient.

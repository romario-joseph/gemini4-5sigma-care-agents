# Eval

Romario Joseph

Baseline: one Gemini 4 Hydrogen call. System: Hydrogen Intake Reader, then Gemini 4 Neon Verifier.

## Run

In the browser: [Open in Colab](https://colab.research.google.com/github/romario-joseph/gemini4-5sigma-care-agents/blob/main/eval/run_eval_colab.ipynb)

Or locally:

```
python eval/run_eval.py
python eval/run_eval.py --cases C01,C09,C18
python eval/run_eval.py --no-verifier --no-url-check
```

Photos and recordings go in `eval/media/` named by case, for example `C02.jpg` or `C07.m4a`. Cases without a file use their text.

## Test set

20 cases: 7 text, 8 photo, 5 voice. Includes a smudged ZIP, a crossed out need, two patients on one form, noisy audio, several languages, a dose request (C09) and a prompt injection (C18).

## Metrics

| Metric | How |
| --- | --- |
| Needs found | F1 against the answer key |
| Urgency, language, ZIP | Match against the answer key |
| Safety | C06, C09, C13, C16, C18 behave as expected |
| Sourced referrals | Share with a source URL |
| Working links | Share of source URLs that load |
| Latency | Seconds per case |

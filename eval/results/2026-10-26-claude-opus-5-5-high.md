# Evaluation: claude-opus-5-5, high effort

13 cases × 3 runs against https://github.com/RetoSchneider/SeatWise.git at `f9313a6` on 2026-10-26.

| Metric | Result |
| --- | --- |
| Correct cause | 39 of 39 (100 %) |
| Answered, not inconclusive | 39 of 39 (100 %) |
| Correct when answered | 39 of 39 (100 %) |
| Same cause in every run | 13 of 13 (100 %) cases |
| Evidence quotes verified | 186 of 186 (100 %) |
| Tool calls per triage | 4.9 |
| Time per triage | 17 s |
| Tokens | 849.3k input and 55.4k output tokens |
| Cost | $2.23 in total, $0.06 per triage |

## By cause

| Expected cause | Correct |
| --- | --- |
| Product defect | 15 of 15 (100 %) |
| Outdated test | 9 of 9 (100 %) |
| Flaky test | 6 of 6 (100 %) |
| Environment issue | 9 of 9 (100 %) |

## Confusion matrix

| Expected ↓ / verdict → | Product defect | Outdated test | Flaky test | Environment issue | Inconclusive |
| --- | --- | --- | --- | --- | --- |
| Environment issue | 0 | 0 | 0 | 9 | 0 |
| Product defect | 15 | 0 | 0 | 0 | 0 |
| Outdated test | 0 | 9 | 0 | 0 | 0 |
| Flaky test | 0 | 0 | 6 | 0 | 0 |

## Cases

| Case | Expected | Verdicts | Verified evidence | Tool calls |
| --- | --- | --- | --- | --- |
| Browsers not installed | Environment issue | ✓ Environment issue, ✓ Environment issue, ✓ Environment issue | 9 of 9 | 2, 2, 2 |
| Cancelled event can be published again | Product defect | ✓ Product defect, ✓ Product defect, ✓ Product defect | 15 of 15 | 5, 4, 5 |
| Test database unavailable | Environment issue | ✓ Environment issue, ✓ Environment issue, ✓ Environment issue | 15 of 15 | 6, 6, 6 |
| Declined payment cannot be retried in the cart | Product defect | ✓ Product defect, ✓ Product defect, ✓ Product defect | 15 of 15 | 9, 8, 7 |
| Reused idempotency key with another payment method | Product defect | ✓ Product defect, ✓ Product defect, ✓ Product defect | 15 of 15 | 5, 5, 6 |
| Payment button renamed | Outdated test | ✓ Outdated test, ✓ Outdated test, ✓ Outdated test | 13 of 13 | 5, 5, 5 |
| Promotion checked after a fixed wait | Flaky test | ✓ Flaky test, ✓ Flaky test, ✓ Flaky test | 16 of 16 | 3, 3, 4 |
| Promotion limit exceeded by concurrent checkouts | Product defect | ✓ Product defect, ✓ Product defect, ✓ Product defect | 18 of 18 | 7, 6, 6 |
| Random seats collide | Flaky test | ✓ Flaky test, ✓ Flaky test, ✓ Flaky test | 17 of 17 | 8, 7, 10 |
| Reservation rate limit raised | Outdated test | ✓ Outdated test, ✓ Outdated test, ✓ Outdated test | 15 of 15 | 4, 4, 4 |
| Test server port already in use | Environment issue | ✓ Environment issue, ✓ Environment issue, ✓ Environment issue | 12 of 12 | 2, 2, 2 |
| Suspended organizer keeps dashboard access | Product defect | ✓ Product defect, ✓ Product defect, ✓ Product defect | 14 of 14 | 5, 5, 5 |
| Validation error code renamed | Outdated test | ✓ Outdated test, ✓ Outdated test, ✓ Outdated test | 12 of 12 | 4, 3, 4 |

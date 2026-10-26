# Example triage

The summary below is the output AITA produced for the case [Declined payment cannot be retried](../eval/cases/declined-payment-cannot-be-retried) from the [evaluation run of 26 October 2026](../eval/results/2026-10-26-claude-opus-5-5-high.md). The fault removed the line that resets the checkout key after a declined payment, under the commit message "Keep one checkout key per cart".

## Test triage

1 failure triaged: 1 × product defect.

| Test                                               | Cause          | Confidence |
| -------------------------------------------------- | -------------- | ---------- |
| declined payments show an error and can be retried | Product defect | high       |

### Product defect: declined payments show an error and can be retried

`tests/ui/booking.spec.ts:45` · failed in chromium · high confidence

After a declined payment, the retry in the cart fails with "This idempotency key belongs to a different checkout request", so "Payment confirmed" never appears. Commit 08030ac removed the line in cart\-view.tsx that cleared the checkout idempotency key after a retryable error. The browser now sends the retry under the failed attempt's key, and the checkout service rejects it as a conflict. Even with an identical request, that key would only replay the PAYMENT\_FAILED result. The server still marks these errors as retryable and tells clients to retry with a new key, so declined payments can no longer be retried from the UI.

**Evidence**

- At the moment of failure the cart shows the server's idempotency conflict error instead of moving to the confirmation page.
  > alert: This idempotency key belongs to a different checkout request
- The only change since the baseline removes the key reset after retryable errors, so the retry reuses the old key.
  > \- if \("error" in payload &amp;&amp; payload.error?.details?.retryable\)
  > \- checkoutKey.current = null;
- A new key is created only when none exists, so after a failure the old key is sent again.
  > checkoutKey.current ??= crypto.randomUUID\(\);
- The server rejects a reused key whose request \(here with a different payment token\) differs from the original, and replays PAYMENT\_FAILED for that key in any case.
  > \(order.requestHash \!== null &amp;&amp; order.requestHash \!== requestHash\)
- The server contract still marks payment failures as retryable and expects a new key, which the client no longer provides.
  > Payment could not be processed. Try again with a new idempotency key.

**Bug report: Declined payment cannot be retried: retry fails with idempotency key conflict** (critical)

1. Sign in as a customer and reserve a seat, then open /cart/&lt;reservationId&gt;
2. In the Payment simulator choose 'Declined payment' and click 'Pay and get tickets'
3. See the alert 'Payment was declined...'
4. Choose 'Successful payment' and click 'Pay and get tickets' again

- **Expected:** The second attempt is charged, the user is redirected to the order page and sees 'Payment confirmed', and one ticket is issued.
- **Actual:** The cart stays open and shows the alert 'This idempotency key belongs to a different checkout request'. No ticket is issued.
- **Suspected cause:** Commit 08030ac \('Keep one checkout key per cart'\) removed \`checkoutKey.current = null\` after retryable errors in src/modules/reservations/cart\-view.tsx pay\(\). The retry reuses the failed attempt's idempotency key. checkout\-service.ts rejects it because the request hash differs \(lines 104\-112\), or would replay PAYMENT\_FAILED \(lines 117\-118\). The server's retryable errors say to retry with a new idempotency key.

**Next step:** Restore the key reset in CartView.pay\(\) so checkoutKey.current is cleared when the error payload has details.retryable. If one key per cart is a hard requirement, change the checkout service so a failed order can accept a new attempt under the same key. As it stands, the client and server contracts conflict. Keep the test unchanged: it describes the behaviour users need.

---

<sub>claude-opus-5-5 · 9 tool calls · 43.1k input and 2.3k output tokens · $0.12 · 26 s agent time</sub>

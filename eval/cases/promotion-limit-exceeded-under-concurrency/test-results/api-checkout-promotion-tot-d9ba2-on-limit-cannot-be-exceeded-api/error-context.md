# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: api\checkout.spec.ts >> promotion totals persist and the redemption limit cannot be exceeded
- Location: tests\api\checkout.spec.ts:117:1

# Error details

```
Error: expect(received).toHaveLength(expected)

Expected length: 1
Received length: 2
Received array:  [{"_apiName": "APIResponse", "_headers": {"_headersArray": [{"name": "Referrer-Policy", "value": "strict-origin-when-cross-origin"}, {"name": "X-Content-Type-Options", "value": "nosniff"}, {"name": "X-Frame-Options", "value": "DENY"}, {"name": "Cross-Origin-Opener-Policy", "value": "same-origin"}, {"name": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(), payment=(), usb=()"}, {"name": "content-security-policy", "value": "default-src 'self'; script-src 'self' 'nonce-YmYxNDdlNzEtYTg1NS00NTQ1LWE5OGQtN2E0NjE0NWU4Njc4' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"}, {"name": "vary", "value": "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch"}, {"name": "content-type", "value": "application/json"}, {"name": "x-request-id", "value": "71200aae-533b-440a-a569-ef74fcc6585a"}, {"name": "Date", "value": "Mon, 26 Oct 2026 14:57:08 GMT"}, …], "_headersMap": {"_map": Map {"referrer-policy" => ["strict-origin-when-cross-origin"], "x-content-type-options" => ["nosniff"], "x-frame-options" => ["DENY"], "cross-origin-opener-policy" => ["same-origin"], "permissions-policy" => ["camera=(), microphone=(), geolocation=(), payment=(), usb=()"], "content-security-policy" => ["default-src 'self'; script-src 'self' 'nonce-YmYxNDdlNzEtYTg1NS00NTQ1LWE5OGQtN2E0NjE0NWU4Njc4' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"], "vary" => ["rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch"], "content-type" => ["application/json"], "x-request-id" => ["71200aae-533b-440a-a569-ef74fcc6585a"], "date" => ["Mon, 26 Oct 2026 14:57:08 GMT"], …}}}, "_initializer": {"fetchUid": "b9c4cd891a639f6e120c7def9b4158f1", "headers": [{"name": "Referrer-Policy", "value": "strict-origin-when-cross-origin"}, {"name": "X-Content-Type-Options", "value": "nosniff"}, {"name": "X-Frame-Options", "value": "DENY"}, {"name": "Cross-Origin-Opener-Policy", "value": "same-origin"}, {"name": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(), payment=(), usb=()"}, {"name": "content-security-policy", "value": "default-src 'self'; script-src 'self' 'nonce-YmYxNDdlNzEtYTg1NS00NTQ1LWE5OGQtN2E0NjE0NWU4Njc4' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"}, {"name": "vary", "value": "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch"}, {"name": "content-type", "value": "application/json"}, {"name": "x-request-id", "value": "71200aae-533b-440a-a569-ef74fcc6585a"}, {"name": "Date", "value": "Mon, 26 Oct 2026 14:57:08 GMT"}, …], "responseEndTiming": 242.1279999999988, "serverAddr": {"ipAddress": "::1", "port": 3100}, "status": 201, "statusText": "Created", "timing": {"connectEnd": -1, "connectStart": -1, "domainLookupEnd": -1, "domainLookupStart": -1, "requestStart": 0.23999999999978172, "responseStart": 241.92199999999866, "secureConnectionStart": -1, "startTime": 1793026627880}, "url": "http://localhost:3100/api/v1/checkout"}, "_request": {"_guid": "request-context@15e4fcb86b1f80dd7fb916d0dd0adda6", "_type": "APIRequestContext"}, Symbol(nodejs.util.inspect.custom): [Function anonymous]}, {"_apiName": "APIResponse", "_headers": {"_headersArray": [{"name": "Referrer-Policy", "value": "strict-origin-when-cross-origin"}, {"name": "X-Content-Type-Options", "value": "nosniff"}, {"name": "X-Frame-Options", "value": "DENY"}, {"name": "Cross-Origin-Opener-Policy", "value": "same-origin"}, {"name": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(), payment=(), usb=()"}, {"name": "content-security-policy", "value": "default-src 'self'; script-src 'self' 'nonce-ZDJkNjdlZjMtMWY4NS00YzU5LWE5NmYtNTRkN2U1NjVkZTJi' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"}, {"name": "vary", "value": "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch"}, {"name": "content-type", "value": "application/json"}, {"name": "x-request-id", "value": "f569ec42-ab10-4e77-b4e6-4b41e66233bd"}, {"name": "Date", "value": "Mon, 26 Oct 2026 14:57:08 GMT"}, …], "_headersMap": {"_map": Map {"referrer-policy" => ["strict-origin-when-cross-origin"], "x-content-type-options" => ["nosniff"], "x-frame-options" => ["DENY"], "cross-origin-opener-policy" => ["same-origin"], "permissions-policy" => ["camera=(), microphone=(), geolocation=(), payment=(), usb=()"], "content-security-policy" => ["default-src 'self'; script-src 'self' 'nonce-ZDJkNjdlZjMtMWY4NS00YzU5LWE5NmYtNTRkN2U1NjVkZTJi' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"], "vary" => ["rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch"], "content-type" => ["application/json"], "x-request-id" => ["f569ec42-ab10-4e77-b4e6-4b41e66233bd"], "date" => ["Mon, 26 Oct 2026 14:57:08 GMT"], …}}}, "_initializer": {"fetchUid": "12be29395f0427a69a42f14a8e438b86", "headers": [{"name": "Referrer-Policy", "value": "strict-origin-when-cross-origin"}, {"name": "X-Content-Type-Options", "value": "nosniff"}, {"name": "X-Frame-Options", "value": "DENY"}, {"name": "Cross-Origin-Opener-Policy", "value": "same-origin"}, {"name": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(), payment=(), usb=()"}, {"name": "content-security-policy", "value": "default-src 'self'; script-src 'self' 'nonce-ZDJkNjdlZjMtMWY4NS00YzU5LWE5NmYtNTRkN2U1NjVkZTJi' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"}, {"name": "vary", "value": "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch"}, {"name": "content-type", "value": "application/json"}, {"name": "x-request-id", "value": "f569ec42-ab10-4e77-b4e6-4b41e66233bd"}, {"name": "Date", "value": "Mon, 26 Oct 2026 14:57:08 GMT"}, …], "responseEndTiming": 240.78200000000106, "serverAddr": {"ipAddress": "::1", "port": 3100}, "status": 201, "statusText": "Created", "timing": {"connectEnd": -1, "connectStart": -1, "domainLookupEnd": -1, "domainLookupStart": -1, "requestStart": 0.16300000000046566, "responseStart": 240.35900000000038, "secureConnectionStart": -1, "startTime": 1793026627880}, "url": "http://localhost:3100/api/v1/checkout"}, "_request": {"_guid": "request-context@968829830631f6c15c77141a40bd6458", "_type": "APIRequestContext"}, Symbol(nodejs.util.inspect.custom): [Function anonymous]}]
```

# Test source

```ts
  46  |   expect(persisted.paymentAttempts[0].status).toBe("SUCCEEDED");
  47  |   expect(
  48  |     await database.seatInventory.findUniqueOrThrow({
  49  |       where: { id: scenario.assigned.seatInventory[0].id },
  50  |     }),
  51  |   ).toMatchObject({ state: "SOLD", activeReservationId: null });
  52  | });
  53  | 
  54  | for (const [token, status, httpStatus] of [
  55  |   ["pm_decline", "DECLINED", 402],
  56  |   ["pm_timeout", "TIMED_OUT", 504],
  57  |   ["pm_transient", "FAILED", 503],
  58  | ] as const) {
  59  |   test(`${token} keeps the reservation available for a successful retry`, async ({
  60  |     customer,
  61  |     scenario,
  62  |   }) => {
  63  |     const id = await reserveSeat(customer, scenario);
  64  |     const failed = await checkout(customer, id, token);
  65  |     expect(failed.status(), await failed.text()).toBe(httpStatus);
  66  |     const order = await database.order.findFirstOrThrow({
  67  |       where: { reservationId: id },
  68  |       include: { tickets: true, paymentAttempts: true, reservation: true },
  69  |     });
  70  |     expect(order).toMatchObject({
  71  |       status: "PAYMENT_FAILED",
  72  |       reservation: { status: "ACTIVE" },
  73  |     });
  74  |     expect(order.tickets).toHaveLength(0);
  75  |     expect(order.paymentAttempts[0].status).toBe(status);
  76  |     expect((await checkout(customer, id)).status()).toBe(201);
  77  |     expect(
  78  |       await database.ticket.count({ where: { userId: scenario.customer.id } }),
  79  |     ).toBe(1);
  80  |   });
  81  | }
  82  | 
  83  | test("an idempotency key cannot be reused for a different reservation", async ({
  84  |   customer,
  85  |   scenario,
  86  | }) => {
  87  |   const first = await reserveSeat(customer, scenario);
  88  |   const second = await reserveSeat(customer, scenario, 1);
  89  |   const key = randomUUID();
  90  |   expect((await checkout(customer, first, "pm_success", key)).status()).toBe(
  91  |     201,
  92  |   );
  93  |   expect((await checkout(customer, second, "pm_success", key)).status()).toBe(
  94  |     409,
  95  |   );
  96  |   expect(
  97  |     await database.reservation.findUniqueOrThrow({ where: { id: second } }),
  98  |   ).toMatchObject({ status: "ACTIVE" });
  99  | });
  100 | 
  101 | test("cancelled events cannot be purchased using an existing reservation", async ({
  102 |   customer,
  103 |   organizer,
  104 |   scenario,
  105 | }) => {
  106 |   const id = await reserveSeat(customer, scenario);
  107 |   await expect(
  108 |     await organizer.post(
  109 |       `/api/v1/organizer/events/${scenario.event.id}/status`,
  110 |       { data: { action: "CANCEL" } },
  111 |     ),
  112 |   ).toBeOK();
  113 |   expect((await checkout(customer, id)).status()).toBe(409);
  114 |   expect(await database.order.count({ where: { reservationId: id } })).toBe(0);
  115 | });
  116 | 
  117 | test("promotion totals persist and the redemption limit cannot be exceeded", async ({
  118 |   customer,
  119 |   otherCustomer,
  120 |   scenario,
  121 | }) => {
  122 |   const first = await reserveSeat(customer, scenario);
  123 |   const second = await reserveSeat(otherCustomer, scenario, 1);
  124 |   for (const [request, id] of [
  125 |     [customer, first],
  126 |     [otherCustomer, second],
  127 |   ] as const) {
  128 |     const response = await request.post(
  129 |       `/api/v1/reservations/${id}/promotion`,
  130 |       { data: { code: scenario.promotion.code } },
  131 |     );
  132 |     await expect(response).toBeOK();
  133 |     expect((await response.json()).data.price).toMatchObject({
  134 |       subtotalCents: 5000,
  135 |       discountCents: 750,
  136 |       feeCents: 213,
  137 |       totalCents: 4463,
  138 |     });
  139 |   }
  140 |   const responses = await Promise.all([
  141 |     checkout(customer, first),
  142 |     checkout(otherCustomer, second),
  143 |   ]);
  144 |   expect(
  145 |     responses.filter((response) => response.status() === 201),
> 146 |   ).toHaveLength(1);
      |     ^ Error: expect(received).toHaveLength(expected)
  147 |   expect(
  148 |     responses.filter((response) => [409, 422].includes(response.status())),
  149 |   ).toHaveLength(1);
  150 |   expect(
  151 |     await database.promotionRedemption.count({
  152 |       where: { promotionCodeId: scenario.promotion.id },
  153 |     }),
  154 |   ).toBe(1);
  155 | });
  156 | 
```
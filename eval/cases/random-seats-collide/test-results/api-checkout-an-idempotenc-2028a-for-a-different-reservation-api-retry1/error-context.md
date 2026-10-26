# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: api\checkout.spec.ts >> an idempotency key cannot be reused for a different reservation
- Location: tests\api\checkout.spec.ts:83:1

# Error details

```
Error: {"error":{"code":"INVENTORY_UNAVAILABLE","message":"Floor A-1 was just selected by someone else","requestId":"1fa3cb5a-e367-4104-aecd-b2ae074cab15"}}

expect(received).toBe(expected) // Object.is equality

Expected: 201
Received: 409
```

# Test source

```ts
  1  | import { randomUUID } from "node:crypto";
  2  | import { expect, type APIRequestContext } from "@playwright/test";
  3  | 
  4  | import type { Scenario } from "./scenario";
  5  | 
  6  | export async function reserveSeat(
  7  |   request: APIRequestContext,
  8  |   scenario: Scenario,
  9  |   seatIndex = 0,
  10 | ): Promise<string> {
  11 |   const response = await request.post("/api/v1/reservations", {
  12 |     data: {
  13 |       performanceId: scenario.performance.id,
  14 |       seatInventoryIds: [scenario.assigned.seatInventory[seatIndex].id],
  15 |     },
  16 |   });
> 17 |   expect(response.status(), await response.text()).toBe(201);
     |                                                    ^ Error: {"error":{"code":"INVENTORY_UNAVAILABLE","message":"Floor A-1 was just selected by someone else","requestId":"1fa3cb5a-e367-4104-aecd-b2ae074cab15"}}
  18 |   return (await response.json()).data.id;
  19 | }
  20 | 
  21 | export async function checkout(
  22 |   request: APIRequestContext,
  23 |   reservationId: string,
  24 |   paymentToken = "pm_success",
  25 |   key = randomUUID(),
  26 | ) {
  27 |   return request.post("/api/v1/checkout", {
  28 |     headers: { "idempotency-key": key },
  29 |     data: { reservationId, paymentToken },
  30 |   });
  31 | }
  32 | 
```
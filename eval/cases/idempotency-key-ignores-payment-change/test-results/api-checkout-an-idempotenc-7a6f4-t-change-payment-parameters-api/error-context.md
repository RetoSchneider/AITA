# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: api\checkout.spec.ts >> an idempotency key cannot change payment parameters
- Location: tests\api\checkout.spec.ts:7:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 409
Received: 402
```

# Test source

```ts
  1   | import { randomUUID } from "node:crypto";
  2   | 
  3   | import { test, expect } from "../support/fixtures";
  4   | import { database } from "../support/scenario";
  5   | import { checkout, reserveSeat } from "../support/api";
  6   | 
  7   | test("an idempotency key cannot change payment parameters", async ({
  8   |   customer,
  9   |   scenario,
  10  | }) => {
  11  |   const id = await reserveSeat(customer, scenario);
  12  |   const key = randomUUID();
  13  |   expect((await checkout(customer, id, "pm_decline", key)).status()).toBe(402);
> 14  |   expect((await checkout(customer, id, "pm_success", key)).status()).toBe(409);
      |                                                                      ^ Error: expect(received).toBe(expected) // Object.is equality
  15  |   expect(
  16  |     await database.ticket.count({ where: { userId: scenario.customer.id } }),
  17  |   ).toBe(0);
  18  | });
  19  | 
  20  | test("checkout issues one ticket and replays the same order", async ({
  21  |   customer,
  22  |   scenario,
  23  | }) => {
  24  |   const id = await reserveSeat(customer, scenario);
  25  |   const key = randomUUID();
  26  |   const first = await checkout(customer, id, "pm_success", key);
  27  |   expect(first.status(), await first.text()).toBe(201);
  28  |   const order = (await first.json()).data;
  29  |   const replay = await checkout(customer, id, "pm_success", key);
  30  |   expect(replay.status()).toBe(201);
  31  |   expect((await replay.json()).data.id).toBe(order.id);
  32  |   const persisted = await database.order.findUniqueOrThrow({
  33  |     where: { id: order.id },
  34  |     include: { tickets: true, paymentAttempts: true, reservation: true },
  35  |   });
  36  |   expect(persisted).toMatchObject({
  37  |     status: "PAID",
  38  |     subtotalCents: 5000,
  39  |     feeCents: 250,
  40  |     totalCents: 5250,
  41  |     currency: "CHF",
  42  |     reservation: { status: "CHECKED_OUT" },
  43  |   });
  44  |   expect(persisted.tickets).toHaveLength(1);
  45  |   expect(persisted.paymentAttempts).toHaveLength(1);
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
```
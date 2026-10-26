# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: api\authorization.spec.ts >> reservation rate limits reject excess requests without creating inventory holds
- Location: tests\api\authorization.spec.ts:5:1

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Expected value: 429
Received array: [422, 422, 422, 422, 422, 422, 422, 422, 422, 422, …]
```

# Test source

```ts
  1   | import { test, expect } from "../support/fixtures";
  2   | import { reserveSeat, checkout } from "../support/api";
  3   | import { database } from "../support/scenario";
  4   | 
  5   | test("reservation rate limits reject excess requests without creating inventory holds", async ({
  6   |   customer,
  7   |   scenario,
  8   | }) => {
  9   |   const statuses: number[] = [];
  10  |   for (let attempt = 0; attempt < 25; attempt++) {
  11  |     const response = await customer.post("/api/v1/reservations", { data: {} });
  12  |     statuses.push(response.status());
  13  |   }
> 14  |   expect(statuses).toContain(429);
      |                    ^ Error: expect(received).toContain(expected) // indexOf
  15  |   expect(statuses.every((status) => [422, 429].includes(status))).toBe(true);
  16  |   expect(
  17  |     await database.reservation.count({
  18  |       where: { userId: scenario.customer.id },
  19  |     }),
  20  |   ).toBe(0);
  21  | });
  22  | 
  23  | test("protected resources require authentication and enforce roles", async ({
  24  |   request,
  25  |   customer,
  26  | }) => {
  27  |   for (const path of [
  28  |     "orders",
  29  |     "tickets",
  30  |     "organizer/dashboard",
  31  |     "admin/dashboard",
  32  |   ]) {
  33  |     const response = await request.get(`/api/v1/${path}`);
  34  |     expect(response.status()).toBe(401);
  35  |     expect((await response.json()).error.code).toBe("AUTHENTICATION_REQUIRED");
  36  |   }
  37  |   for (const path of ["organizer/dashboard", "admin/users", "admin/refunds"]) {
  38  |     expect((await customer.get(`/api/v1/${path}`)).status()).toBe(403);
  39  |   }
  40  | });
  41  | 
  42  | test("customers cannot access or mutate another customer's resources", async ({
  43  |   customer,
  44  |   otherCustomer,
  45  |   scenario,
  46  | }) => {
  47  |   const id = await reserveSeat(customer, scenario);
  48  |   expect((await otherCustomer.get(`/api/v1/reservations/${id}`)).status()).toBe(
  49  |     404,
  50  |   );
  51  |   expect(
  52  |     (await otherCustomer.delete(`/api/v1/reservations/${id}`)).status(),
  53  |   ).toBe(404);
  54  |   expect(
  55  |     (
  56  |       await otherCustomer.post(`/api/v1/reservations/${id}/promotion`, {
  57  |         data: { code: scenario.promotion.code },
  58  |       })
  59  |     ).status(),
  60  |   ).toBe(404);
  61  |   const response = await checkout(customer, id);
  62  |   expect(response.status()).toBe(201);
  63  |   const order = (await response.json()).data;
  64  |   expect((await otherCustomer.get(`/api/v1/orders/${order.id}`)).status()).toBe(
  65  |     404,
  66  |   );
  67  |   expect(
  68  |     (
  69  |       await otherCustomer.get(`/api/v1/tickets/${order.tickets[0].id}`)
  70  |     ).status(),
  71  |   ).toBe(404);
  72  |   expect(
  73  |     (
  74  |       await otherCustomer.post(`/api/v1/orders/${order.id}/refunds`, {
  75  |         data: { reason: "I cannot attend this event" },
  76  |       })
  77  |     ).status(),
  78  |   ).toBe(404);
  79  | });
  80  | 
  81  | test("cross-origin mutations fail without changing inventory", async ({
  82  |   customer,
  83  |   scenario,
  84  | }) => {
  85  |   const response = await customer.post("/api/v1/reservations", {
  86  |     headers: { origin: "https://untrusted.example" },
  87  |     data: {
  88  |       performanceId: scenario.performance.id,
  89  |       seatInventoryIds: [scenario.assigned.seatInventory[0].id],
  90  |     },
  91  |   });
  92  |   expect(response.status()).toBe(403);
  93  |   expect(
  94  |     await database.reservation.count({
  95  |       where: { performanceId: scenario.performance.id },
  96  |     }),
  97  |   ).toBe(0);
  98  | });
  99  | 
  100 | test("role changes take effect on an existing session", async ({
  101 |   administrator,
  102 |   organizer,
  103 |   scenario,
  104 | }) => {
  105 |   await expect(await organizer.get("/api/v1/organizer/dashboard")).toBeOK();
  106 |   const changed = await administrator.patch(
  107 |     `/api/v1/admin/users/${scenario.organizerUser.id}/role`,
  108 |     { data: { role: "CUSTOMER" } },
  109 |   );
  110 |   await expect(changed).toBeOK();
  111 |   expect((await organizer.get("/api/v1/organizer/dashboard")).status()).toBe(
  112 |     403,
  113 |   );
  114 | });
```
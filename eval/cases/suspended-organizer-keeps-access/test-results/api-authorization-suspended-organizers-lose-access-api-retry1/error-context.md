# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: api\authorization.spec.ts >> suspended organizers lose access
- Location: tests\api\authorization.spec.ts:116:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 403
Received: 200
```

# Test source

```ts
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
  115 | 
  116 | test("suspended organizers lose access", async ({
  117 |   administrator,
  118 |   organizer,
  119 |   scenario,
  120 | }) => {
  121 |   await expect(
  122 |     await administrator.patch(
  123 |       `/api/v1/admin/organizers/${scenario.organizer.id}/status`,
  124 |       { data: { status: "SUSPENDED" } },
  125 |     ),
  126 |   ).toBeOK();
> 127 |   expect((await organizer.get("/api/v1/organizer/dashboard")).status()).toBe(
      |                                                                         ^ Error: expect(received).toBe(expected) // Object.is equality
  128 |     403,
  129 |   );
  130 | });
  131 | 
```
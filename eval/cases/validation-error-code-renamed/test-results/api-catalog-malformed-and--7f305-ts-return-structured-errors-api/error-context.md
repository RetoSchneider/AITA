# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: api\catalog.spec.ts >> malformed and invalid requests return structured errors
- Location: tests\api\catalog.spec.ts:52:1

# Error details

```
Error: expect(received).toMatchObject(expected)

- Expected  - 1
+ Received  + 1

  Object {
-   "code": "VALIDATION_ERROR",
+   "code": "INVALID_REQUEST",
    "requestId": Any<String>,
  }
```

# Test source

```ts
  1  | import { test, expect } from "../support/fixtures";
  2  | import { database } from "../support/scenario";
  3  | 
  4  | test("catalog sorts by date before pagination", async ({
  5  |   request,
  6  |   scenario,
  7  | }) => {
  8  |   const earlier = await database.event.create({
  9  |     data: {
  10 |       organizerId: scenario.organizer.id,
  11 |       venueId: scenario.venue.id,
  12 |       slug: `earlier-${scenario.id}`,
  13 |       title: "Earlier concert",
  14 |       summary: scenario.event.summary,
  15 |       description: scenario.event.description,
  16 |       category: scenario.event.category,
  17 |       status: "PUBLISHED",
  18 |       performances: {
  19 |         create: {
  20 |           startsAt: new Date(Date.now() + 10 * 86_400_000),
  21 |           salesStartAt: scenario.performance.salesStartAt,
  22 |           salesEndAt: new Date(Date.now() + 9 * 86_400_000),
  23 |         },
  24 |       },
  25 |     },
  26 |   });
  27 |   const first = await request.get("/api/v1/events", {
  28 |     params: {
  29 |       category: scenario.event.category,
  30 |       sort: "date",
  31 |       pageSize: 1,
  32 |       page: 1,
  33 |     },
  34 |   });
  35 |   await expect(first).toBeOK();
  36 |   expect(
  37 |     (await first.json()).data.map((event: { id: string }) => event.id),
  38 |   ).toEqual([earlier.id]);
  39 |   const second = await request.get("/api/v1/events", {
  40 |     params: {
  41 |       category: scenario.event.category,
  42 |       sort: "date",
  43 |       pageSize: 1,
  44 |       page: 2,
  45 |     },
  46 |   });
  47 |   expect(
  48 |     (await second.json()).data.map((event: { id: string }) => event.id),
  49 |   ).toEqual([scenario.event.id]);
  50 | });
  51 | 
  52 | test("malformed and invalid requests return structured errors", async ({
  53 |   customer,
  54 |   request,
  55 | }) => {
  56 |   const malformed = await customer.post("/api/v1/reservations", {
  57 |     headers: { "content-type": "application/json" },
  58 |     data: Buffer.from("{"),
  59 |   });
  60 |   expect(malformed.status()).toBe(400);
  61 |   const invalid = await request.get("/api/v1/events?pageSize=1000");
  62 |   expect(invalid.status()).toBe(422);
  63 |   const body = await invalid.json();
> 64 |   expect(body.error).toMatchObject({
     |                      ^ Error: expect(received).toMatchObject(expected)
  65 |     code: "VALIDATION_ERROR",
  66 |     requestId: expect.any(String),
  67 |   });
  68 |   expect(invalid.headers()["x-request-id"]).toBe(body.error.requestId);
  69 | });
  70 | 
```
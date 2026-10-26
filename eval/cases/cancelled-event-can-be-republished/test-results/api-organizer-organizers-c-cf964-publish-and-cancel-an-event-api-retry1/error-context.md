# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: api\organizer.spec.ts >> organizers can create, publish, unpublish, and cancel an event
- Location: tests\api\organizer.spec.ts:4:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 409
Received: 200
```

# Test source

```ts
  1  | import { test, expect } from "../support/fixtures";
  2  | import { database } from "../support/scenario";
  3  | 
  4  | test("organizers can create, publish, unpublish, and cancel an event", async ({
  5  |   organizer,
  6  |   request,
  7  |   scenario,
  8  | }) => {
  9  |   const created = await organizer.post("/api/v1/organizer/events", {
  10 |     data: {
  11 |       venueId: scenario.venue.id,
  12 |       title: "New automation concert",
  13 |       summary: "A newly created event for the organizer workflow.",
  14 |       description:
  15 |         "This event exercises the full organizer lifecycle against real inventory.",
  16 |       category: "Music",
  17 |       performance: {
  18 |         startsAt: scenario.performance.startsAt.toISOString(),
  19 |         salesStartAt: scenario.performance.salesStartAt.toISOString(),
  20 |         salesEndAt: scenario.performance.salesEndAt.toISOString(),
  21 |       },
  22 |       ticketTypes: [
  23 |         {
  24 |           sectionId: scenario.venue.sections[1].id,
  25 |           name: "Standard",
  26 |           priceCents: 2500,
  27 |           currency: "CHF",
  28 |           capacity: 6,
  29 |         },
  30 |       ],
  31 |     },
  32 |   });
  33 |   expect(created.status(), await created.text()).toBe(201);
  34 |   const event = (await created.json()).data;
  35 |   expect((await request.get(`/api/v1/events/${event.slug}`)).status()).toBe(
  36 |     404,
  37 |   );
  38 |   for (const action of ["PUBLISH", "UNPUBLISH", "PUBLISH", "CANCEL"]) {
  39 |     await expect(
  40 |       await organizer.post(`/api/v1/organizer/events/${event.id}/status`, {
  41 |         data: { action },
  42 |       }),
  43 |     ).toBeOK();
  44 |     expect((await request.get(`/api/v1/events/${event.slug}`)).status()).toBe(
  45 |       action === "PUBLISH" ? 200 : 404,
  46 |     );
  47 |   }
  48 |   expect(
  49 |     (
  50 |       await organizer.post(`/api/v1/organizer/events/${event.id}/status`, {
  51 |         data: { action: "PUBLISH" },
  52 |       })
  53 |     ).status(),
> 54 |   ).toBe(409);
     |     ^ Error: expect(received).toBe(expected) // Object.is equality
  55 |   expect(
  56 |     await database.performance.findFirstOrThrow({
  57 |       where: { eventId: event.id },
  58 |     }),
  59 |   ).toMatchObject({ status: "CANCELLED" });
  60 | });
  61 | 
  62 | test("invalid organizer input is rejected before creating records", async ({
  63 |   organizer,
  64 |   scenario,
  65 | }) => {
  66 |   const response = await organizer.post("/api/v1/organizer/venues", {
  67 |     data: {
  68 |       name: "Invalid timezone venue",
  69 |       description: scenario.venue.description,
  70 |       addressLine1: "Teststrasse 2",
  71 |       city: "Zurich",
  72 |       region: "Zurich",
  73 |       postalCode: "8000",
  74 |       countryCode: "CH",
  75 |       timezone: "Europe/NotACity",
  76 |     },
  77 |   });
  78 |   expect(response.status()).toBe(422);
  79 |   expect(
  80 |     await database.venue.count({
  81 |       where: { organizerId: scenario.organizer.id },
  82 |     }),
  83 |   ).toBe(1);
  84 | });
  85 | 
```
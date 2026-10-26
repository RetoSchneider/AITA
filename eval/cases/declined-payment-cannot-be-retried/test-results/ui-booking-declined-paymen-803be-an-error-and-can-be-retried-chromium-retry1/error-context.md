# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui\booking.spec.ts >> declined payments show an error and can be retried
- Location: tests\ui\booking.spec.ts:45:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Payment confirmed', { exact: true })
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByText('Payment confirmed', { exact: true }) with timeout 10000ms
  - waiting for getByText('Payment confirmed', { exact: true })

```

```yaml
- link "Skip to content":
  - /url: "#main-content"
- banner:
  - link "SeatWise":
    - /url: /
  - navigation "Primary":
    - list:
      - listitem:
        - link "Events":
          - /url: /events
      - listitem:
        - link "My account":
          - /url: /account
  - text: Change language
  - combobox "Change language":
    - option "English" [selected]
    - option "Deutsch"
  - text: Test CUSTOMER 0
  - button "Sign out"
- main:
  - paragraph: Reserved
  - heading "Test Concert 561c4ee4-6208-4556-be86-be2f417226db" [level=1]
  - paragraph: Nov 25, 2026, 3:52 PM · Test Concert Hall
  - timer: 9:51
  - paragraph: Assigned seat × 1
  - paragraph: Floor, row A, seat 1
  - paragraph: CHF 50.00
  - button "Release tickets"
  - heading "Promotion code" [level=2]
  - text: Promotion code
  - textbox "Promotion code":
    - /placeholder: Enter code
  - button "Apply"
  - heading "Payment simulator" [level=2]
  - paragraph: Choose a deterministic local outcome. No card details are collected or stored.
  - group "Payment outcome":
    - text: Payment outcome
    - radio "Successful payment" [checked]
    - text: Successful payment
    - radio "Declined payment"
    - text: Declined payment
    - radio "Provider timeout"
    - text: Provider timeout
    - radio "Transient provider failure"
    - text: Transient provider failure
  - complementary:
    - heading "Order summary" [level=2]
    - term: Tickets
    - definition: CHF 50.00
    - term: Service fee
    - definition: CHF 2.50
    - term: Total
    - definition: CHF 52.50
    - alert: This idempotency key belongs to a different checkout request
    - button "Pay and get tickets"
    - paragraph: Totals and availability are checked again on the server before payment.
- contentinfo:
  - paragraph: SeatWise · Thoughtful ticketing for every seat.
  - navigation "Footer":
    - list:
      - listitem:
        - link "Browse events":
          - /url: /events
      - listitem:
        - link "API documentation":
          - /url: /docs/api
- alert
```

# Test source

```ts
  1   | import { test, expect, signIn } from "../support/fixtures";
  2   | import { database, password } from "../support/scenario";
  3   | import { reserveSeat } from "../support/api";
  4   | 
  5   | test("customer signs in, books a seat, and opens the issued QR ticket", async ({
  6   |   page,
  7   |   scenario,
  8   | }) => {
  9   |   await page.goto(`/sign-in?callbackURL=/events/${scenario.event.slug}`);
  10  |   await page.getByLabel("Email address").fill(scenario.customer.email);
  11  |   await page.getByLabel("Password", { exact: true }).fill(password);
  12  |   await page.getByRole("button", { name: "Sign in", exact: true }).click();
  13  |   await expect(page).toHaveURL(`/events/${scenario.event.slug}`);
  14  |   const seat = page.getByRole("button", { name: /Floor, row A, seat 1,/ });
  15  |   await seat.focus();
  16  |   await page.keyboard.press("Space");
  17  |   await expect(seat).toHaveAttribute("aria-pressed", "true");
  18  |   await page.getByRole("button", { name: "Reserve selection" }).click();
  19  |   await expect(page).toHaveURL(/\/cart\//);
  20  |   await page
  21  |     .getByLabel("Promotion code", { exact: true })
  22  |     .fill(scenario.promotion.code);
  23  |   await page.getByRole("button", { name: "Apply", exact: true }).click();
  24  |   await expect(
  25  |     page.getByText(`Promotion (${scenario.promotion.code})`),
  26  |   ).toBeVisible();
  27  |   await page.getByRole("button", { name: "Pay and get tickets" }).click();
  28  |   await expect(
  29  |     page.getByText("Payment confirmed", { exact: true }),
  30  |   ).toBeVisible();
  31  |   await page.getByRole("link", { name: "View ticket", exact: true }).click();
  32  |   await expect(page).toHaveURL(/\/account\/tickets\/[^/]+$/);
  33  |   await expect(
  34  |     page.getByRole("heading", { name: scenario.event.title }),
  35  |   ).toBeVisible();
  36  |   await expect(page.getByRole("img", { name: /QR code/i })).toBeVisible();
  37  |   const order = await database.order.findFirstOrThrow({
  38  |     where: { userId: scenario.customer.id },
  39  |     include: { tickets: true },
  40  |   });
  41  |   expect(order).toMatchObject({ status: "PAID", totalCents: 4463 });
  42  |   expect(order.tickets).toHaveLength(1);
  43  | });
  44  | 
  45  | test("declined payments show an error and can be retried", async ({
  46  |   page,
  47  |   scenario,
  48  | }) => {
  49  |   await signIn(page.request, scenario.customer.email);
  50  |   const id = await reserveSeat(page.request, scenario);
  51  |   await page.goto(`/cart/${id}`);
  52  |   await page.getByLabel("Declined payment", { exact: true }).check();
  53  |   await page.getByRole("button", { name: "Pay and get tickets" }).click();
  54  |   await expect(page.getByRole("main").getByRole("alert")).toContainText(
  55  |     "Payment was declined",
  56  |   );
  57  |   await expect(
  58  |     page.getByRole("button", { name: "Pay and get tickets" }),
  59  |   ).toBeEnabled();
  60  |   await page.getByLabel("Successful payment", { exact: true }).check();
  61  |   await page.getByRole("button", { name: "Pay and get tickets" }).click();
  62  |   await expect(
  63  |     page.getByText("Payment confirmed", { exact: true }),
> 64  |   ).toBeVisible();
      |     ^ Error: expect(locator).toBeVisible() failed
  65  |   expect(
  66  |     await database.ticket.count({ where: { userId: scenario.customer.id } }),
  67  |   ).toBe(1);
  68  | });
  69  | 
  70  | test("general admission can be reserved and released", async ({
  71  |   page,
  72  |   scenario,
  73  | }) => {
  74  |   await signIn(page.request, scenario.customer.email);
  75  |   await page.goto(`/events/${scenario.event.slug}`);
  76  |   await page
  77  |     .getByRole("button", { name: "Add one Standing ticket ticket" })
  78  |     .click();
  79  |   await page
  80  |     .getByRole("button", { name: "Add one Standing ticket ticket" })
  81  |     .click();
  82  |   await expect(page.getByLabel("Standing ticket quantity")).toHaveText("2");
  83  |   await page.getByRole("button", { name: "Reserve selection" }).click();
  84  |   await expect(page).toHaveURL(/\/cart\//);
  85  |   await page.getByRole("button", { name: "Release tickets" }).click();
  86  |   await expect(page).toHaveURL(`/events/${scenario.event.slug}`);
  87  |   expect(
  88  |     await database.generalAdmissionInventory.findUniqueOrThrow({
  89  |       where: { ticketTypeId: scenario.standing.id },
  90  |     }),
  91  |   ).toMatchObject({ reserved: 0, sold: 0 });
  92  | });
  93  | 
  94  | test("network failure leaves checkout usable", async ({ page, scenario }) => {
  95  |   await signIn(page.request, scenario.customer.email);
  96  |   const id = await reserveSeat(page.request, scenario);
  97  |   await page.goto(`/cart/${id}`);
  98  |   await page.route(
  99  |     "**/api/v1/checkout",
  100 |     async (route) => {
  101 |       await route.fetch();
  102 |       await route.abort();
  103 |     },
  104 |     {
  105 |       times: 1,
  106 |     },
  107 |   );
  108 |   await page.getByRole("button", { name: "Pay and get tickets" }).click();
  109 |   await expect(page.getByRole("main").getByRole("alert")).toHaveText(
  110 |     "The request could not be completed. Please try again.",
  111 |   );
  112 |   await expect(
  113 |     page.getByRole("button", { name: "Pay and get tickets" }),
  114 |   ).toBeEnabled();
  115 |   await page.getByRole("button", { name: "Pay and get tickets" }).click();
  116 |   await expect(
  117 |     page.getByText("Payment confirmed", { exact: true }),
  118 |   ).toBeVisible();
  119 | });
  120 | 
```
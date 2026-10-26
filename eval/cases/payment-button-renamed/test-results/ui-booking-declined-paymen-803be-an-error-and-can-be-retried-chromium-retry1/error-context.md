# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui\booking.spec.ts >> declined payments show an error and can be retried
- Location: tests\ui\booking.spec.ts:45:1

# Error details

```
Test timeout of 45000ms exceeded.
```

```
Error: locator.click: Test timeout of 45000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Pay and get tickets' })

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - link "Skip to content" [ref=e2] [cursor=pointer]:
    - /url: "#main-content"
  - banner [ref=e3]:
    - generic [ref=e4]:
      - link [ref=e5] [cursor=pointer]:
        - /url: /
      - navigation "Primary" [ref=e10]:
        - list [ref=e11]:
          - listitem [ref=e12]:
            - link "Events" [ref=e13] [cursor=pointer]:
              - /url: /events
          - listitem [ref=e14]:
            - link "My account" [ref=e15] [cursor=pointer]:
              - /url: /account
      - generic [ref=e16]:
        - generic [ref=e17]:
          - generic [ref=e21]: Change language
          - combobox "Change language" [ref=e22] [cursor=pointer]:
            - option "English" [selected]
            - option "Deutsch"
        - generic [ref=e23]: Test CUSTOMER 0
        - button "Sign out" [ref=e25]
  - main [ref=e29]:
    - generic [ref=e31]:
      - generic [ref=e32]:
        - generic [ref=e33]:
          - generic [ref=e34]:
            - generic [ref=e35]:
              - paragraph [ref=e36]: Reserved
              - heading "Test Concert 77e9e3a8-fee5-4d68-a235-f4ca6826c3e7" [level=1] [ref=e37]
              - paragraph [ref=e38]: Nov 25, 2026, 3:55 PM · Test Concert Hall
            - timer [ref=e39]:
              - generic [ref=e43]: 9:16
          - generic [ref=e45]:
            - generic [ref=e46]:
              - paragraph [ref=e47]: Assigned seat × 1
              - paragraph [ref=e48]: Floor, row A, seat 1
            - paragraph [ref=e49]: CHF 50.00
          - button "Release tickets" [ref=e50]
        - generic [ref=e54]:
          - heading "Promotion code" [level=2] [ref=e59]
          - generic [ref=e60]:
            - generic [ref=e61]:
              - generic [ref=e62]: Promotion code
              - textbox "Promotion code" [ref=e63]:
                - /placeholder: Enter code
            - button "Apply" [ref=e64]
        - generic [ref=e65]:
          - heading "Payment simulator" [level=2] [ref=e66]
          - paragraph [ref=e67]: Choose a deterministic local outcome. No card details are collected or stored.
          - group "Payment outcome" [ref=e68]:
            - generic [ref=e70]:
              - radio "Successful payment" [ref=e71]
              - text: Successful payment
            - generic [ref=e72]:
              - radio "Declined payment" [checked] [active] [ref=e73]
              - text: Declined payment
            - generic [ref=e74]:
              - radio "Provider timeout" [ref=e75]
              - text: Provider timeout
            - generic [ref=e76]:
              - radio "Transient provider failure" [ref=e77]
              - text: Transient provider failure
      - complementary [ref=e78]:
        - heading "Order summary" [level=2] [ref=e79]
        - generic [ref=e80]:
          - generic [ref=e81]:
            - term [ref=e82]: Tickets
            - definition [ref=e83]: CHF 50.00
          - generic [ref=e84]:
            - term [ref=e85]: Service fee
            - definition [ref=e86]: CHF 2.50
          - generic [ref=e87]:
            - term [ref=e88]: Total
            - definition [ref=e89]: CHF 52.50
        - button "Pay now" [ref=e90]
        - paragraph [ref=e91]: Totals and availability are checked again on the server before payment.
  - contentinfo [ref=e92]:
    - generic [ref=e93]:
      - paragraph [ref=e94]: SeatWise · Thoughtful ticketing for every seat.
      - navigation "Footer" [ref=e95]:
        - list [ref=e96]:
          - listitem [ref=e97]:
            - link "Browse events" [ref=e98] [cursor=pointer]:
              - /url: /events
          - listitem [ref=e99]:
            - link "API documentation" [ref=e100] [cursor=pointer]:
              - /url: /docs/api
  - alert [ref=e101]
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
> 53  |   await page.getByRole("button", { name: "Pay and get tickets" }).click();
      |                                                                   ^ Error: locator.click: Test timeout of 45000ms exceeded.
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
  64  |   ).toBeVisible();
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
# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui\booking.spec.ts >> customer signs in, books a seat, and opens the issued QR ticket
- Location: tests\ui\booking.spec.ts:5:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
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
              - heading "Test Concert 0d680d7c-26e5-4805-b8ca-87dec6d90572" [level=1] [ref=e37]
              - paragraph [ref=e38]: Nov 25, 2026, 4:09 PM · Test Concert Hall
            - timer [ref=e39]:
              - generic [ref=e43]: 10:00
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
                - text: 0D680D7C26E54805B8CA87DE
            - button "Apply" [ref=e64]
        - generic [ref=e65]:
          - heading "Payment simulator" [level=2] [ref=e66]
          - paragraph [ref=e67]: Choose a deterministic local outcome. No card details are collected or stored.
          - group "Payment outcome" [ref=e68]:
            - generic [ref=e70]:
              - radio "Successful payment" [checked] [ref=e71]
              - text: Successful payment
            - generic [ref=e72]:
              - radio "Declined payment" [ref=e73]
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
            - term [ref=e85]: Promotion (0D680D7C26E54805B8CA87DE)
            - definition [ref=e86]: −CHF 7.50
          - generic [ref=e87]:
            - term [ref=e88]: Service fee
            - definition [ref=e89]: CHF 2.13
          - generic [ref=e90]:
            - term [ref=e91]: Total
            - definition [ref=e92]: CHF 44.63
        - button "Pay and get tickets" [ref=e93]
        - paragraph [ref=e94]: Totals and availability are checked again on the server before payment.
  - contentinfo [ref=e95]:
    - generic [ref=e96]:
      - paragraph [ref=e97]: SeatWise · Thoughtful ticketing for every seat.
      - navigation "Footer" [ref=e98]:
        - list [ref=e99]:
          - listitem [ref=e100]:
            - link "Browse events" [ref=e101] [cursor=pointer]:
              - /url: /events
          - listitem [ref=e102]:
            - link "API documentation" [ref=e103] [cursor=pointer]:
              - /url: /docs/api
  - alert [ref=e104]
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
  24  |   await page.waitForTimeout(30);
  25  |   expect(
  26  |     await page.getByText(`Promotion (${scenario.promotion.code})`).isVisible(),
> 27  |   ).toBe(true);
      |     ^ Error: expect(received).toBe(expected) // Object.is equality
  28  |   await page.getByRole("button", { name: "Pay and get tickets" }).click();
  29  |   await expect(
  30  |     page.getByText("Payment confirmed", { exact: true }),
  31  |   ).toBeVisible();
  32  |   await page.getByRole("link", { name: "View ticket", exact: true }).click();
  33  |   await expect(page).toHaveURL(/\/account\/tickets\/[^/]+$/);
  34  |   await expect(
  35  |     page.getByRole("heading", { name: scenario.event.title }),
  36  |   ).toBeVisible();
  37  |   await expect(page.getByRole("img", { name: /QR code/i })).toBeVisible();
  38  |   const order = await database.order.findFirstOrThrow({
  39  |     where: { userId: scenario.customer.id },
  40  |     include: { tickets: true },
  41  |   });
  42  |   expect(order).toMatchObject({ status: "PAID", totalCents: 4463 });
  43  |   expect(order.tickets).toHaveLength(1);
  44  | });
  45  | 
  46  | test("declined payments show an error and can be retried", async ({
  47  |   page,
  48  |   scenario,
  49  | }) => {
  50  |   await signIn(page.request, scenario.customer.email);
  51  |   const id = await reserveSeat(page.request, scenario);
  52  |   await page.goto(`/cart/${id}`);
  53  |   await page.getByLabel("Declined payment", { exact: true }).check();
  54  |   await page.getByRole("button", { name: "Pay and get tickets" }).click();
  55  |   await expect(page.getByRole("main").getByRole("alert")).toContainText(
  56  |     "Payment was declined",
  57  |   );
  58  |   await expect(
  59  |     page.getByRole("button", { name: "Pay and get tickets" }),
  60  |   ).toBeEnabled();
  61  |   await page.getByLabel("Successful payment", { exact: true }).check();
  62  |   await page.getByRole("button", { name: "Pay and get tickets" }).click();
  63  |   await expect(
  64  |     page.getByText("Payment confirmed", { exact: true }),
  65  |   ).toBeVisible();
  66  |   expect(
  67  |     await database.ticket.count({ where: { userId: scenario.customer.id } }),
  68  |   ).toBe(1);
  69  | });
  70  | 
  71  | test("general admission can be reserved and released", async ({
  72  |   page,
  73  |   scenario,
  74  | }) => {
  75  |   await signIn(page.request, scenario.customer.email);
  76  |   await page.goto(`/events/${scenario.event.slug}`);
  77  |   await page
  78  |     .getByRole("button", { name: "Add one Standing ticket ticket" })
  79  |     .click();
  80  |   await page
  81  |     .getByRole("button", { name: "Add one Standing ticket ticket" })
  82  |     .click();
  83  |   await expect(page.getByLabel("Standing ticket quantity")).toHaveText("2");
  84  |   await page.getByRole("button", { name: "Reserve selection" }).click();
  85  |   await expect(page).toHaveURL(/\/cart\//);
  86  |   await page.getByRole("button", { name: "Release tickets" }).click();
  87  |   await expect(page).toHaveURL(`/events/${scenario.event.slug}`);
  88  |   expect(
  89  |     await database.generalAdmissionInventory.findUniqueOrThrow({
  90  |       where: { ticketTypeId: scenario.standing.id },
  91  |     }),
  92  |   ).toMatchObject({ reserved: 0, sold: 0 });
  93  | });
  94  | 
  95  | test("network failure leaves checkout usable", async ({ page, scenario }) => {
  96  |   await signIn(page.request, scenario.customer.email);
  97  |   const id = await reserveSeat(page.request, scenario);
  98  |   await page.goto(`/cart/${id}`);
  99  |   await page.route(
  100 |     "**/api/v1/checkout",
  101 |     async (route) => {
  102 |       await route.fetch();
  103 |       await route.abort();
  104 |     },
  105 |     {
  106 |       times: 1,
  107 |     },
  108 |   );
  109 |   await page.getByRole("button", { name: "Pay and get tickets" }).click();
  110 |   await expect(page.getByRole("main").getByRole("alert")).toHaveText(
  111 |     "The request could not be completed. Please try again.",
  112 |   );
  113 |   await expect(
  114 |     page.getByRole("button", { name: "Pay and get tickets" }),
  115 |   ).toBeEnabled();
  116 |   await page.getByRole("button", { name: "Pay and get tickets" }).click();
  117 |   await expect(
  118 |     page.getByText("Payment confirmed", { exact: true }),
  119 |   ).toBeVisible();
  120 | });
  121 | 
```
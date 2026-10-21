# Zentory test plan

This plan is the gate for letting more cafes onto Zentory while the product is still in early testing. It covers the HTTP API the OceanZ cafe uses and the screens staff actually click: POS, purchases, orders, and parties.

Automated cases run on this machine against an in-memory Firestore stand-in and a headless browser. They do not call the live `inventory-management-oceanz` project, so a test run cannot spend the Spark daily quota. Manual cases are the flows that need a signed-in browser, charts, or a production index, and they are listed with the result a person should see.

## How to run

From the repo root, with Node 18 or newer and Chrome available:

```bash
npm test
```

That command runs four layers:

| Layer | File | What it exercises |
| --- | --- | --- |
| HTTP API | `tests/api.test.mjs` | `GET /api/health`, `GET /api/products`, `POST /api/sales`, `POST /api/sales/void` |
| Business rules | `tests/store.test.mjs` | `js/store.js` in a fresh `localStorage`, including the sync budget |
| UI focus | `tests/ui-runner.mjs` + `tests/ui-harness.html` | POS, purchase, receive, and make-to-order against the real scripts |
| UI pages | `tests/ui-deep-runner.mjs` + `tests/ui-deep.js` | The real `index.html` in headless Chrome, with an in-memory Firebase stand-in |

API calls are served by `tests/fake-firestore.mjs`. It stores documents in the same encoded field shape the production client writes, and it counts reads the way Spark does: one read per returned document, and one read for an empty query. A sale for company A must not be billed for company B's batches.

UI cases load the same classic scripts the app ships. Firebase is left unloaded. `App.showToast` and `Auth` are stubbed so a click can be judged by the toast, the stock figure, and the receipt modal.

## What a failure means

- Stock, money, GST, Khata, or idempotency failures are product defects. Fix the app and keep the test.
- A changed toast or button label is a harness update, after confirming the screen still does the job.
- `invalid JSON currently returns 500` is a known API gap. The handler should answer 400. The test records today's behavior so the gap stays visible.

## API cases (automated)

Auth key is `X-Zentory-Key` or `Authorization: Bearer`, defaulting to the server key in `api/_lib/http.js`.

| Case | Expected |
| --- | --- |
| `GET /api/health` with no key | 200, `service: zentory-api` |
| `OPTIONS /api/sales` from `http://localhost:3000` | 204 and that origin echoed |
| Products or sales with no key, or the wrong key | 401 |
| Same product list with the header and with Bearer | 200, `Cache-Control: private, max-age=30` |
| `GET /api/sales` | 405 |
| Missing owner, location, items, or `externalId` | 400 |
| Item qty 0, or an unknown `productId` | 400 and zero writes |
| Body `{` | 500 `Invalid JSON body` (known gap; should be 400) |
| Simple sale, qty 4, price ₹100, GST 18%, two lots | 201, total ₹472, earliest expiry consumed first |
| 50 batches owned by another company | Those batches stay out of the read count (6 reads for this sale) |
| Payment method outside cash / UPI / card | Stored as `cash` |
| Same `externalId` posted again | 200, `idempotent: true`, one read, zero writes, quantity unchanged |
| Two lines that together exceed stock | 409, zero writes, quantity unchanged |
| Make-to-order while ingredient tracking is on and stock is short | 409, ingredient quantity unchanged |
| Make-to-order while ingredient tracking is off | 201, ingredient quantity unchanged, cost from the latest batch including a newer zero-qty batch |
| Recipe wastage of 10% on 50 ml, with 100 ml on hand | Catalog `stock` is 1 (100 / 55), the sale consumes 55 ml, cost is ₹5.50 |
| One finished cup already produced, then a second cup | First sale takes the finished lot and leaves ingredients; the second sale consumes the recipe |
| Two cups requested when only one finished cup exists and ingredients are short | 409, zero writes, finished quantity unchanged |
| A raw line and a recipe that together need more of the same ingredient than is on hand | 409, zero writes, quantity unchanged |
| `POST /api/sales/void` | Lot and stock quantity restored |
| Void the same sale again | 200, `alreadyVoided: true`, quantity unchanged |
| Void an unknown `externalId` | 404 |
| `GET /api/products` twice inside the catalog window | Second response adds zero reads |

## Business rules (automated)

These call `Store` directly, which is what the screens call after a click.

| Case | Expected |
| --- | --- |
| POS sale across two expiries | Earlier expiry reaches zero first; stock total matches the lots |
| Line carries a chosen `batchId` | That lot is consumed ahead of the earlier expiry |
| 1 × ₹100 at 18% GST | Subtotal 100, tax 18, total 118 |
| Sale larger than the lot | `success: false`, no sale row, quantity unchanged |
| Unknown product | No sale row |
| Manual purchase of ₹100 with ₹40 paid | Status `open`, payment `partial`, Khata balance −60 (the company owes the supplier) |
| Same purchase paid in full | Status `completed`, no Khata row, stock increased |
| Manual purchase with no location on file | `No location selected` |
| Field sale delivered with a short payment | Stock down, status `open`, Khata credit for the remainder (the customer owes the company) |
| Field sale whose lines together exceed stock | Nothing consumed, order stays `pending`, no Khata row |
| Field sale whose first line is make-to-order and whose later line is short | Ingredient quantity unchanged |
| Two make-to-order lines that together need more than the ingredient lot | Rejected, ingredient quantity unchanged |
| Settle an open field sale | Status `completed`, payment `paid`, `amountPaid` equals the total |
| Ingredient tracking off | Sale succeeds, lots unchanged, cost uses the newer zero-qty batch |
| Ingredient tracking on (the default when the company field is absent) and the lot is empty | Sale refused |
| Ingredient tracking on and the lot covers the recipe | Ingredient quantity reduced, cost matches the lot |
| Produce one cup, sell it, then sell another | The first sale takes the `PROD-` lot and does not touch ingredients; the next sale consumes the recipe, including 10% wastage, earliest expiry first; a further cup is refused with nothing consumed |
| One bill sells the raw ingredient and a recipe that needs the same ingredient | Refused, quantity unchanged, no sale row |
| Move a lot to another location, part then all | Unit cost and expiry stay; both locations' stock totals follow the lots |
| Ingredient tracking off, after Produce | The finished cup is sold and the recipe is not deducted; a second cup still leaves ingredient quantity unchanged |
| Short-paid field sale of a produced cup | Finished quantity drops, ingredients stay, status `open`, Khata credit for the unpaid part |
| Marketplace delivery when the lot is short | Status stays `pending`, quantity unchanged |
| Khata credit 80 then debit 30 | Balance 50 |
| Cart already holding seller A | Adding seller B is refused and the cart stays with A |
| Company sync when local products exist and the last sync is under 10 minutes | Second `Store.sync` performs no Firestore calls; `{ force: true }` syncs again |
| Boot sync | Does not query `products` where `isPublished` |
| POS history query returns no rows | Receipt counter is left as it was |
| `Store.syncMarketplace` | Loads published products; a second call inside six hours does not |
| `Store.ensurePosSales` for 7 days after a 30-day boot | No extra read; 90 days issues a wider query |
| `Store._clearLocalData` | Removes `ims_sync_at_*`, `ims_pos_days_*`, and `ims_mkt_at` |

The field-sale checks above also lock a stock fix: make-to-order ingredients are deducted only after every line on the order has been confirmed.

## UI cases (automated)

Two Chrome runs. The focused harness opens `tests/ui-harness.html` and drives POS, purchase, receive, and make-to-order. The page suite opens the real `index.html`. Chart.js, jsPDF, SheetJS, and the Firebase CDN are replaced with local stand-ins, and the service worker is not registered, so the run never reaches `inventory-management-oceanz`.

The page suite signs in as the owner and walks every sidebar destination, then staff and marketing. On each page it uses the search box, the filters, the sortable headers, the add and edit forms, and the destructive buttons. Stock and money assertions sit behind the clicks: a POS line can choose the later tea lot, a short-paid field delivery posts Khata, a purchase paid in full does not, and a second shop is refused while the cart still holds the first.

Focused harness:

| Case | Steps and expected result |
| --- | --- |
| Empty bill | After refresh, Complete Sale is enabled. Clicking it toasts "Add a product to the bill first". |
| Successful sale | Add Tea and click Complete Sale. Tea lot drops by 1, the receipt modal is visible and contains `RCT-`, toast is "Sale completed! Stock updated." |
| Stock disappears before checkout | Add Soda, set its lot to zero, click Complete Sale. Toast reports the shortage and the lot stays at zero. |
| Add supplier | Click Add supplier. The party modal opens with type seller. Saving "Farm Co" closes the modal and selects that supplier. |
| Record purchase | Submit with the supplier cleared: toast "Select a supplier". Put the supplier back, add Beans, pay the line in full. Beans stock increases, toast "Purchase recorded. Stock & Khata updated.", and the app navigates to orders. |
| Receive | Create a pending manual purchase and open the Purchase tab. Click Receive. Cookie stock increases by the ordered qty and the toast confirms the receipt. |
| Tracked make-to-order | Add Latte while the company still tracks ingredients and the roast lot is empty. Toast "Not enough ingredients to make more". The bill stays empty and both roast lots stay at zero. |
| Untracked make-to-order | Turn ingredient tracking off, add Latte, complete the sale. Roast lots stay at zero, the sale cost is ₹90 from the latest batch (10 g × ₹9), and the receipt opens. |

The page suite covers sign-in (unknown code, change company, wrong password, owner login, logout), the sidebar and every nav group, theme, refresh, the low-stock bell, the bottom bar and More sheet, dashboard stat cards and quick actions, locations, categories, products (filters, sort, MRP guard, detail save, publish, delete), produce, the sector catalog, CSV import including its back buttons, inventory (search, low and location filters, add batch, edit lot, reorder level, delete lot, CSV and PDF export), purchase (search, category combobox, qty, remove, clear, new supplier, paid-in-full record), orders (sort, receive, approve, ship, deliver, invoice print, field accept, short pay, mark paid, cancel), POS (empty bill, search, category combobox, other location, lot picker, GST, checkout, clear), shop (search, seller and category filters, cart qty, one-seller guard, place order), field orders, Khata, parties, team (short password, ingredient switch, remove worker), and the four report ranges. Staff land on POS and marketing lands on field orders; a disallowed `App.goTo` bounces back.

One page-suite case walks a cafe day. Milk is bought into Dry Store as two lots (earlier expiry first), the whole early lot and part of the later lot are moved to Cafe Counter, and the leftover store lot is edited. Cutting Chai is saved with 8 g beans and 50 ml milk at 10% waste; the making-cost field matches that recipe, and the product detail shows 55 ml including waste. POS sells one cup and the earlier milk lot drops by 55. Produce builds one finished cup. POS then shows "1 ready"; asking for five cups is refused; selling the one ready cup does not touch milk or beans again. A further cup is refused. The expiring-stock report lists the milk that is still inside 90 days.

## Still for a person

These need a signed-in browser, a phone, or the live project. Leave the OceanZ company document alone: do not write `trackIngredientStock` onto `co_mqgbs2zvzjfei8`. Create the `pos_sales` composite index (`ownerId` ascending, `createdAt` ascending) in the Firebase console before judging sync cost. Do not deploy Firestore rules or indexes from the CLI.

| Area | Why it is not in `npm test` | Pass when |
| --- | --- | --- |
| Onboarding | The suite signs in with onboarding already completed, so the overlay never covers the buttons. | A brand-new company can add a location and a first product, and both show up in POS and Purchase. |
| Last location | Deleting the final location would remove the counter the later checks use. | The toast is "You must have at least one location" and the counter stays. |
| Phone layout | Chrome runs at a desktop size. Bottom-nav clicks are covered; the visual stacking is not. | At a phone width, Dashboard, Orders, and POS stay reachable and the POS and Purchase buttons stay on screen. |
| Real print | `window.open` is stubbed so headless Chrome does not throw. | Print on an invoice and a receipt shows the party, lines, GST, and total. |
| PWA offline | The suite strips the service worker so it cannot serve a stale shell. | After this release the cache name is `zentory-v32`. Offline reload still opens the shell. |
| Admin console | `admin.html` is a separate page and is not loaded. | A super-admin edit is still there after refresh, and the page does not download every order. |
| Office role | Staff and marketing are the restricted landings. Office is the same gate with a wider view list. | An office login can open orders and cannot open team. |
| Live API | Covered against the in-memory store. | A fresh `externalId` moves stock once, the repeat returns the same sale, and void puts the quantity back. |

## Results

`npm test` on 21 Oct 2026, Node v22, headless Chrome. Nothing in this run called live Firestore.

| Layer | Result |
| --- | --- |
| API (`tests/api.test.mjs`) | 20 passed |
| Business rules (`tests/store.test.mjs`) | 28 passed |
| UI focus (`tests/ui-runner.mjs`) | 8 passed |
| UI pages (`tests/ui-deep-runner.mjs`) | 28 passed |

84 automated cases passed. The known API gap remains: a sales body of `{` returns 500.

Three product fixes came out of the page suite. The shop cart looked up the seller as a user, so "Ordering from" was blank for another company; it now uses the company name. The reports revenue canvas reused the dashboard id `chart-revenue`, so that chart was drawn on the dashboard; the reports canvas is `chart-report-revenue`. Opening Shop did not load other companies' stock, so every marketplace product showed Out of stock; the shop sync now reads each other company's stock once and keeps that with the six-hour catalog cache.

Recipe and stock changes from the cafe-day run: a sale now uses finished lots first and only then the recipe, and that recipe includes wastage. A bill that would spend the same ingredient twice (a raw line plus a recipe, or two recipes) is refused before anything is deducted. The same split is what `POST /api/sales` and the product catalog stock figure use. Inventory can move a lot, in full or in part, from one location to another; cost and expiry stay with the lot, and both stock totals are recounted. POS and inventory show ready cups and how many more can be made. Service worker cache is `zentory-v32`.

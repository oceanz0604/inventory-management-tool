# Zentory test plan

This plan is the gate for letting more cafes onto Zentory while the product is still in early testing. It covers the HTTP API the OceanZ cafe uses and the screens staff actually click: POS, purchases, orders, and parties.

Automated cases run on this machine against an in-memory Firestore stand-in and a headless browser. They do not call the live `inventory-management-oceanz` project, so a test run cannot spend the Spark daily quota. Manual cases are the flows that need a signed-in browser, charts, or a production index, and they are listed with the result a person should see.

## How to run

From the repo root, with Node 18 or newer and Chrome available:

```bash
npm test
```

That command runs three layers:

| Layer | File | What it exercises |
| --- | --- | --- |
| HTTP API | `tests/api.test.mjs` | `GET /api/health`, `GET /api/products`, `POST /api/sales`, `POST /api/sales/void` |
| Business rules | `tests/store.test.mjs` | `js/store.js` in a fresh `localStorage`, including the sync budget |
| UI | `tests/ui-runner.mjs` + `tests/ui-harness.html` | Real `pos.js`, `purchase.js`, `orders.js`, and `parties.js` in headless Chrome |

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

Headless Chrome opens `tests/ui-harness.html`, which contains the same element ids the screens bind to (`#pos-checkout-btn`, `#po-add-seller`, `#order-tabs`, `#party-form`, and the orders table inside `.card`).

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

## Manual cases

Run these in a browser against a test company. Leave the OceanZ company document alone: do not write `trackIngredientStock` onto `co_mqgbs2zvzjfei8`. Create the `pos_sales` composite index (`ownerId` ascending, `createdAt` ascending) in the Firebase console before judging sync cost; until that index exists, boot falls back to reading every sale for the company. Do not deploy Firestore rules or indexes from the CLI.

| Area | What to do | Pass when |
| --- | --- | --- |
| Sign-in | Log in with a company username. Log out. Log in again. | Second boot within 10 minutes does not reload the whole catalog. The top-bar refresh forces a sync. |
| Roles | Sign in as staff, then as marketing. | Staff lands on POS. Marketing can raise a field order. Owner sees purchases, Khata, and reports. |
| Dashboard | Open Dashboard after a POS sale and after a purchase. | Today's figures and low-stock list match the stock screen. |
| Products | Filter by type, category, unit, and published. Edit a product. Sort a column. | The grid and the edit form show the saved values. Raw items stay out of POS. |
| Make-to-order recipe | Add a recipe row and save. Produce one with tracking on, then turn tracking off for a test company and sell. | Tracking on blocks a sale that is short. Tracking off sells and the ingredient lot does not move. Making cost follows the latest batch. |
| Searchable selects | Open supplier, product, and location dropdowns near the bottom of the panel. Scroll the page. | The panel stays on screen, closes on outside scroll, and the choice sticks. |
| Shop | Publish a product from company A. Open Shop as company B. Add it, then try a product from company C. | Cart keeps a single seller. Checkout creates an order company A can accept, ship, and deliver, and company B receives stock at its default location. |
| Field order | Marketing creates an order. Office accepts, delivers a partial payment, then marks the rest paid. | Stock falls on delivery. Khata shows the customer balance. Mark Paid completes the order. |
| Khata screen | Record a credit and a debit for one party. | Running balance matches the store rule: credit increases what they owe, debit decreases it. |
| Reports | Open 7, 30, 90, and 365 day ranges. | Charts render. A range wider than the cached POS window loads once, then stays cached. |
| Invoice and receipt | Print a delivered order and a POS receipt. | A print window opens with the party, lines, GST, and total. |
| Import | Import a small CSV and a catalog template. | New products appear for that company. A bad row is reported and earlier rows stay consistent. |
| Team | Create a worker, sign in as that worker, remove the worker. | The worker sees only their role. Removal blocks the next sign-in. |
| Onboarding | Create a new company, location, and first product. | POS and Purchase both list that location. |
| Theme and layout | Toggle dark mode. Collapse the sidebar. Resize to a phone width. | Dashboard, Orders, and POS stay pinned. Purchase and POS action buttons stay on screen. |
| PWA | Load the deployed app, go offline, reload. | The shell opens from the service worker. After this release the cache name is `zentory-v30`. |
| Admin | Sign in to `admin.html` as the super admin. Edit a customer. | The change is visible after refresh. The page does not download every order in the project. |
| API from the cafe | Post a sale with a fresh `externalId`, repeat it, then void it. | Stock moves once, the repeat returns the same sale id, and void puts the quantity back. |

## Results

`npm test` on 21 Oct 2026, Node v22, headless Chrome. Nothing in this run called live Firestore.

| Layer | Result |
| --- | --- |
| API (`tests/api.test.mjs`) | 16 passed |
| Business rules (`tests/store.test.mjs`) | 22 passed |
| UI (`tests/ui-runner.mjs`) | 8 passed |

46 automated cases passed. The manual table is still for a person to walk through in a signed-in browser. The known API gap remains: a sales body of `{` returns 500.

One product fix came out of the business-rule cases. A field sale that started with a make-to-order line used to deduct ingredients before later lines were checked, so a short later line left raw stock already consumed. Delivery now confirms every line, including two recipe lines that would overdraw the same ingredient, and only then reduces lots. Service worker cache is `zentory-v30` because `js/store.js` changed.

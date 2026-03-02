# inventory-management-tool — Project Overview

**Repository:** `https://github.com/oceanz0604/inventory-management-tool`  
**Local path:** `c:\Users\decrypter\PycharmProjects\inventory-management-tool`

---

## What It Is

**झटपट (ZatPat)** — A B2B multi-location inventory marketplace. Vanilla HTML, CSS, and JavaScript; no build step. Each user is a shop owner: they manage products, stock across locations, and orders, and can browse and buy from other shops.

---

## Tech Stack

| Layer   | Technology                         |
|---------|------------------------------------|
| Markup  | HTML5                              |
| Styling | CSS3 (custom properties)           |
| Logic   | Vanilla JavaScript (ES6+)         |
| Charts  | Chart.js 4 (CDN)                   |
| PDF     | jsPDF + jsPDF-AutoTable (CDN)      |
| Icons   | Font Awesome 6 (CDN)               |
| Fonts   | Inter, Tiro Devanagari Marathi (Google Fonts) |

No `package.json` or `requirements.txt`; all dependencies are loaded via CDN in `index.html`.

---

## Project Layout

```
inventory-management-tool/
├── index.html       # SPA entry; auth screen + app shell
├── css/
│   └── style.css    # All styles
├── js/
│   ├── store.js     # localStorage data layer (users, categories, locations, products, stock, orders, cart, POS)
│   ├── auth.js      # Login, signup, demo login
│   ├── locations.js # Location CRUD
│   ├── products.js  # Product catalog CRUD
│   ├── inventory.js# Stock grid (product × location)
│   ├── orders.js    # Sales/Purchase orders, status workflow
│   ├── shop.js      # Marketplace: browse other shops, cart, place order
│   ├── dashboard.js # Stats, charts, low-stock alerts
│   ├── export.js    # CSV and PDF export
│   ├── pos.js       # Point-of-sale: location, search, add to bill, checkout
│   └── app.js       # Init, routing, theme, nav, categories, toasts
└── README.md
```

---

## Data Model (localStorage)

| Key / Entity | Purpose |
|--------------|--------|
| Users        | Shop owners (one business per user) |
| Categories   | Shared product categories (with colors) |
| Locations    | Warehouses/stores per user |
| Products     | Catalog (SKU, price, published flag) |
| Stock        | Quantity per product per location |
| Orders       | Buyer/seller, line items, status (Pending → Approved → Shipped → Delivered) |
| Cart         | In-browser cart (per session) |
| POS sales    | Point-of-sale transactions |

`store.js` seeds demo data (e.g. TechSupply Co, GreenGoods, MediPharma, BuildRight Hardware, FreshBite Catering) and provides CRUD + helpers for all entities.

---

## Entrypoints & Flow

1. **Run:** Open `index.html` in a modern browser (no server required).
2. **Auth:** Login form, signup form, or demo buttons (e.g. TechSupply Co, GreenGoods) set current user in localStorage; `app.js` then shows the app and calls `Store.seedDemoData()`.
3. **App init:** `app.js` initializes Locations, Products, Inventory, Orders, Shop, POS, Dashboard, Export and navigates to dashboard. Theme (light/dark) is toggled from the UI and stored in `ims_theme`.
4. **Views:** Single-page app with view switching (dashboard, locations, products, inventory, orders, shop, POS). No backend; all state in localStorage.

---

## Main Features

- Multi-location inventory and stock grid
- Product catalog with categories and publish/unpublish for marketplace
- Orders as both Sales (seller) and Purchase (buyer); status workflow with inventory updates on delivery
- Marketplace shop: browse published products from other shops, cart, place order
- Dashboard: stats, stock-by-location and value-by-category charts, low-stock alerts
- Search, filter, sort on data views
- CSV and PDF export of inventory
- POS: select location, search/filter products, add to bill, checkout, receipt
- Demo mode with pre-seeded shops and sample orders

---

## Summary

Clone is at `c:\Users\decrypter\PycharmProjects\inventory-management-tool`. Open `index.html` in a browser to run. Open this folder in Cursor (File → Open Folder) to work on the project. No install or build steps.

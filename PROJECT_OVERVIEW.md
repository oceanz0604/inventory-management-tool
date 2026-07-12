# inventory-management-tool — Project Overview

**Repository:** `https://github.com/oceanz0604/inventory-management-tool`  
**Local path:** `c:\Users\decrypter\PycharmProjects\inventory-management-tool`

---

## What It Is

**Zentory** — A B2B multi-location inventory marketplace. Vanilla HTML, CSS, and JavaScript; no build step. Each user is a shop owner: they manage products, stock across locations, and orders, and can browse and buy from other shops.

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

1. **Run:** Open `index.html` (client app) or `admin.html` (super-admin console). Backend is Firebase (Auth + Firestore) with a localStorage write-through cache.
2. **Client auth (code-first):** Stage 1 asks for a **company code**; stage 2 collects **username + password**, matched client-side against that company's users in Firestore (passwords are salted+hashed, never plaintext). Company users do not use Firebase Auth. There is **no signup and no demo data** — companies/logins are created by the admin.
3. **Admin auth:** `admin.html` is a separate endpoint where the single super-admin signs in with Firebase Auth to view stats, add customers (companies + owner accounts), and clean up data.
4. **App init:** `app.js` initializes all modules and routes to a role-appropriate default view. Theme (light/dark) is stored in `ims_theme`. Super-admin sessions are redirected from the client app to `admin.html`.

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

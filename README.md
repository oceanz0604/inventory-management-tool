# Zentory - Multi-Location Inventory Marketplace

A full-featured B2B inventory management marketplace built with vanilla HTML, CSS, and JavaScript. Every user is a shop owner who manages products, stock across locations, and orders -- and can also browse and buy from other shops. No build tools required.

## Features

- **Multi-Location Inventory** -- Manage stock across multiple warehouses/stores per shop
- **Product Catalog** -- CRUD with category tagging and publish/unpublish for marketplace visibility
- **Dual-Perspective Orders** -- Every order is a Sales Order for the seller and a Purchase Order for the buyer
- **Order Workflow** -- Pending -> Approved -> Shipped -> Delivered (with cancel option)
- **Inventory Side Effects** -- Delivery automatically decrements seller stock and increments buyer stock
- **Marketplace Shop** -- Browse other shops' published products, add to cart, place orders
- **Dashboard** -- Stats, stock-by-location chart, value-by-category chart, low-stock alerts
- **Search, Filter & Sort** -- On every data view (products, stock, orders)
- **Export** -- CSV and PDF export of inventory data
- **User Authentication** -- Sign up / sign in with localStorage sessions
- **Demo Mode** -- Two pre-seeded shops (TechSupply Co, GreenGoods) with sample data and orders
- **Responsive** -- Mobile-friendly with collapsible sidebar

## Getting Started

1. Open `index.html` in any modern browser.
2. Click **TechSupply Co** or **GreenGoods** to instantly log in as a demo shop.
3. Use the **Switch User** button (in the sidebar footer) to swap perspectives.
4. Browse the **Shop** tab to place orders from the other shop.

## Data Model

| Entity     | Description                                       |
|------------|---------------------------------------------------|
| Users      | Shop owners (each user is a business)             |
| Locations  | Warehouses/stores per user                        |
| Products   | Catalog items with SKU, price, published flag     |
| Stock      | Quantity per product per location                  |
| Orders     | Buyer/seller, line items, status workflow          |
| Categories | Shared product categories with colors             |
| Cart       | In-browser shopping cart (per session)             |

## Project Structure

```
inventory-management-system/
├── index.html          # SPA entry point
├── css/
│   └── style.css       # All styles
├── js/
│   ├── store.js        # localStorage data layer (all entities)
│   ├── auth.js         # Authentication + demo login
│   ├── locations.js    # Location CRUD
│   ├── products.js     # Product catalog CRUD
│   ├── inventory.js    # Stock grid (product x location)
│   ├── orders.js       # Sales/Purchase orders + status workflow
│   ├── shop.js         # Marketplace: browse, cart, place order
│   ├── dashboard.js    # Stats, charts, low-stock alerts
│   ├── export.js       # CSV and PDF export
│   └── app.js          # Routing, categories, toasts, init
└── README.md
```

## Tech Stack

| Layer      | Technology                    |
|------------|-------------------------------|
| Markup     | HTML5                         |
| Styling    | CSS3 (custom properties)      |
| Logic      | Vanilla JavaScript (ES6+)     |
| Charts     | Chart.js 4 (CDN)              |
| PDF Export | jsPDF + jsPDF-AutoTable (CDN) |
| Icons      | Font Awesome 6 (CDN)          |
| Font       | Inter (Google Fonts)           |

## License

MIT

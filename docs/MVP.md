# ZatPat (झटपट) — MVP Document

**Version:** 1.0
**Date:** March 2026
**Status:** Draft
**Author:** ZatPat Product Team

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Target Users & Business Types](#2-target-users--business-types)
3. [Core Features — MVP (Phase 1)](#3-core-features--mvp-phase-1)
4. [Phase 2 Features — Post-MVP](#4-phase-2-features--post-mvp)
5. [User Roles & Access Control](#5-user-roles--access-control)
6. [Data Model](#6-data-model)
7. [User Flows](#7-user-flows)
8. [Business Model & Monetization](#8-business-model--monetization)
9. [Tech Architecture](#9-tech-architecture)
10. [Competitive Analysis](#10-competitive-analysis)
11. [Phased Roadmap](#11-phased-roadmap)
12. [Success Metrics & KPIs](#12-success-metrics--kpis)
13. [Risks & Mitigations](#13-risks--mitigations)
14. [Appendix: Business-Specific Scenarios](#appendix-business-specific-scenarios)

---

## 1. Executive Summary

### The Problem

India has over 63 million MSMEs (Micro, Small, and Medium Enterprises). The vast majority manage their inventory on paper registers, WhatsApp groups, or disconnected spreadsheets. Existing digital tools are either too expensive, too complex, or narrowly designed for a single industry. A medical store owner, a hotel chef, a car garage mechanic, and a general store shopkeeper all face the same fundamental challenge — tracking what comes in, what goes out, and what's left — yet no single affordable tool serves them all.

The supply chain is equally fragmented. Manufacturers sell to distributors over phone calls. Distributors take orders on WhatsApp. Retailers restock by physically visiting wholesale markets. Consumers have limited access to local shop inventories online. Every handoff in this chain is manual, error-prone, and opaque.

### The Vision

**ZatPat (झटपट)** — meaning "instantly" in Marathi/Hindi — is a universal commerce platform where any business, regardless of type or size, can:

- **Manage inventory** across multiple locations with real-time stock tracking
- **Trade with other businesses** (B2B) through a built-in marketplace
- **Sell to walk-in customers** through an integrated POS counter
- **Sell to online consumers** (B2C) through a Blinkit/Instamart-style local delivery marketplace (Phase 2)

One tool. Every business. From manufacturer to consumer.

### Tagline

> *"India's universal business OS — from manufacturer to consumer, all on one platform."*

### Why Now

- UPI adoption has crossed 10B+ monthly transactions — digital payments are universal
- Smartphone penetration in Tier 2/3 cities has crossed 70%
- Post-COVID, small businesses are actively seeking digital tools
- Government push for GST compliance is forcing digital record-keeping
- No existing tool combines inventory + B2B + B2C + POS in one platform

---

## 2. Target Users & Business Types

ZatPat is designed to be a single tool that adapts to any business type. Below is a breakdown of the primary user segments, their workflows, and what they need from the platform.

### 2.1 Manufacturers

**Examples:** Soap factory, packaged food producer, garment manufacturer, pharmaceutical company

**Workflow:**
- Purchase raw materials from suppliers
- Maintain Bill of Materials (BOM) for each finished product
- Produce finished goods, auto-deducting raw materials from inventory
- Sell in bulk to distributors/wholesalers at factory price
- Track production cost vs selling price for margin analysis

**Key needs:** BOM/recipe management, production tracking, bulk order management, batch/lot tracking

### 2.2 Distributors / Wholesalers

**Examples:** FMCG distributor, pharmaceutical wholesaler, electronics distributor, building materials supplier

**Workflow:**
- Buy in bulk from manufacturers at wholesale/factory price
- Break bulk into smaller lots (case → individual units)
- Maintain multiple warehouse locations
- Sell to retailers at distributor price (markup over factory price)
- Manage credit terms (khata) with regular retailer customers

**Key needs:** Multi-location stock, unit conversion, tiered pricing, credit/khata management, bulk order processing

### 2.3 Retailers

**Examples:** Medical store, electronics shop, general/kirana store, stationery shop, mobile accessories shop, electrical shop

**Workflow:**
- Purchase from distributors/wholesalers at distributor price
- Sell individual units to walk-in customers at MRP/retail price
- Track expiry dates (medical, food items)
- Manage daily POS billing for walk-in customers
- Reorder when stock runs low

**Key needs:** POS counter, expiry tracking, barcode scanning, GST invoicing, low-stock alerts, simple UI

### 2.4 Service + Retail Hybrids

**Examples:** Hotels, restaurants, dhabas, car garages, salons, bakeries, sweet shops, catering services

**Workflow:**
- Purchase raw materials from markets/distributors (vegetables, spare parts, chemicals)
- Transform/produce finished goods or services (food dishes, car repairs, beauty treatments)
- The "product" sold to the customer is a combination of raw materials + labor
- Need to calculate true cost of the finished product from ingredients/materials
- Sell via POS to walk-in customers or via online orders

**Key needs:** Recipe/BOM management, production costing, POS, menu/service catalog, ingredient-level inventory tracking

### 2.5 Home Businesses

**Examples:** Home bakers, tiffin services, homemade pickle/papad sellers, craft sellers, freelance tailors

**Workflow:**
- Operate from home with minimal infrastructure
- Source raw materials from local markets
- Produce goods and sell via WhatsApp, Instagram, or word-of-mouth
- Need a simple online storefront to accept orders
- Want to track costs and profits without accounting knowledge

**Key needs:** Simple product catalog, order management, cost tracking, online storefront (Phase 2), WhatsApp integration

---

## 3. Core Features — MVP (Phase 1)

### 3.1 Universal Inventory Engine

The foundation of the platform. A flexible product catalog and stock system that works for any business type.

| Feature | Description |
|---|---|
| **Product Catalog** | Name, SKU, description, category, images, HSN code |
| **Multi-unit Support** | kg, grams, liters, ml, pieces, packs, strips, dozen, cases, meters |
| **Unit Conversion** | Define conversions: 1 case = 24 bottles, 1 kg = 1000 g |
| **Multi-location Stock** | Track stock per product per warehouse/store/location |
| **Batch & Expiry Tracking** | Batch number, manufacturing date, expiry date per stock entry |
| **Low Stock Alerts** | Configurable minimum stock threshold per product per location |
| **Auto-reorder Suggestions** | When stock hits minimum, suggest reorder from last supplier |
| **Barcode / SKU Lookup** | Search products by scanning barcode or typing SKU |
| **Categories & Tags** | Organize products into categories with color-coded tags |

### 3.2 Cost & Pricing Chain

Supports the full pricing chain from manufacturer to consumer.

```
Manufacturer        Distributor         Retailer           Consumer
(Factory Price) --> (Wholesale Price) --> (Retail Price) --> (MRP)
    ₹10                 ₹15                  ₹22              ₹25
```

| Feature | Description |
|---|---|
| **Cost Price** | What the business paid for the product (auto-set from purchase orders) |
| **Selling Price** | What the business sells the product for |
| **MRP** | Maximum retail price (displayed on product, cannot exceed) |
| **Wholesale Price** | Bulk price for B2B buyers (optional, for businesses that sell in bulk) |
| **Margin Calculator** | Live margin % and profit per unit displayed everywhere |
| **Tiered Pricing** | Different prices for different buyer types or quantity slabs |
| **Auto Cost Update** | When a purchase order is delivered, the product's cost price auto-updates |

### 3.3 Bill of Materials (BOM) / Recipe Management

Enables production-based businesses to track what goes into making a finished product.

**Use cases:**
- **Hotel/Restaurant:** 1 Paneer Butter Masala = 200g paneer (₹8) + 100g tomato (₹2) + 50g butter (₹3) + spice mix (₹1) = **₹14 production cost**, sold at **₹220**
- **Manufacturer:** 1 Box of Soap (12 bars) = 2kg soap base (₹40) + fragrance (₹5) + packaging (₹8) = **₹53 cost**, sold at **₹120**
- **Garage:** Oil Change Service = 4L engine oil (₹800) + oil filter (₹200) + labor (₹300) = **₹1300 cost**, charged **₹2000**

| Feature | Description |
|---|---|
| **Recipe Builder** | Define ingredients/components with quantities and units |
| **Auto Cost Calculation** | Production cost computed from current ingredient costs |
| **Produce Action** | "Produce X units" auto-deducts raw materials from inventory |
| **Yield Tracking** | Expected vs actual yield (e.g., 10kg dough → 95 rotis vs expected 100) |
| **Nested BOM** | A BOM can reference another BOM (sub-assemblies) |

### 3.4 POS Counter (Walk-in Sales)

A fast, touch-friendly billing interface for businesses with walk-in customers.

| Feature | Description |
|---|---|
| **Quick-tap Product Grid** | Visual product cards, tap to add to bill |
| **Search / Barcode Scan** | Find products instantly by name, SKU, or barcode |
| **Location Selector** | Choose which location's stock to bill from |
| **Quantity Controls** | +/- buttons, direct quantity input |
| **Bill Preview** | Running total with itemized list |
| **Payment Modes** | Cash, UPI, Card — selectable per transaction |
| **Customer Name** | Optional — for tracking repeat walk-in customers |
| **Receipt Generation** | Printable receipt with shop name, items, total, GST |
| **Daily Summary** | Today's sales count, revenue, profit, items sold |
| **Shift Management** | Open/close register, track cash in drawer |

### 3.5 B2B Marketplace (Trade Portal)

Every business on ZatPat can buy from and sell to other businesses.

| Feature | Description |
|---|---|
| **Business Storefront** | Each business has a public catalog of published products |
| **Product Discovery** | Browse/search products from other businesses by category, location, price |
| **Cart & Checkout** | Add products from a seller's catalog, place order |
| **Order Workflow** | Pending → Approved → Shipped → Delivered (or Cancelled) |
| **Dual Perspective** | Same order shows as "Sales Order" for seller, "Purchase Order" for buyer |
| **Auto Stock Adjustment** | On delivery: seller stock decreases, buyer stock increases |
| **Auto Product Creation** | If buyer doesn't have the product in catalog, it's auto-created on delivery |
| **Credit / Khata System** | Track outstanding amounts between businesses |
| **Order History** | Full transaction history with filters by date, status, party |
| **Bulk Pricing** | Sellers can set quantity-based price tiers |

### 3.6 GST & Tax Management

Essential for compliance in India.

| Feature | Description |
|---|---|
| **GST Rate per Product** | 0%, 5%, 12%, 18%, 28% — configurable per product |
| **HSN Code** | Harmonized System of Nomenclature code per product |
| **GSTIN Storage** | Store GST number per business for B2B invoices |
| **Auto Tax Calculation** | CGST + SGST (intra-state) or IGST (inter-state) based on business location |
| **GST Invoice Generation** | Compliant invoice with all required fields |
| **Tax Summary Report** | Monthly GST summary for filing (GSTR-1 data) |

### 3.7 Reports & Analytics Dashboard

Business intelligence that any shopkeeper can understand.

| Report | Description |
|---|---|
| **Revenue & Profit** | Daily/weekly/monthly revenue, cost, and profit trends |
| **Top Products** | Best sellers by quantity and by revenue |
| **Slow Movers** | Products with no/low sales in the past 30/60/90 days |
| **Stock Valuation** | Total inventory value at cost price and at selling price |
| **Stock by Location** | Visual breakdown of stock distribution across locations |
| **Expiry Report** | Products expiring within 30/60/90 days |
| **Supplier Performance** | Order fulfillment rate, delivery time by supplier |
| **Customer Insights** | Top customers by order value, frequency |
| **P&L Summary** | Profit & Loss statement for a given period |
| **Export** | Download any report as CSV or PDF |

### 3.8 UI & Design Principles

| Principle | Implementation |
|---|---|
| **Simplicity first** | No feature requires more than 3 taps/clicks to access |
| **Works for everyone** | A 50-year-old kirana store owner should be able to use it without training |
| **Responsive** | Desktop, tablet, and mobile — POS optimized for tablet |
| **Dark/Light theme** | Toggle with auto-detection of OS preference |
| **Minimal text input** | Prefer taps, dropdowns, toggles over typing |
| **Visual feedback** | Color-coded stock levels, margin indicators, order statuses |
| **Language** | English for MVP, Hindi/Marathi/regional in Phase 2 |

---

## 4. Phase 2 Features — Post-MVP

### 4.1 B2C Consumer Marketplace (Blinkit/Instamart Style)

A consumer-facing layer where end customers can order from local shops online.

| Feature | Description |
|---|---|
| **Consumer App/Web** | Separate consumer-facing UI (not the business dashboard) |
| **Shop Discovery** | "Near Me" shops using geolocation, filterable by type |
| **Product Browsing** | Categories, search, filters (price, rating, availability) |
| **Cart & Checkout** | Multi-shop cart support, delivery address management |
| **Order Tracking** | Placed → Accepted → Preparing → Out for Delivery → Delivered |
| **Ratings & Reviews** | Rate shops and products |
| **Favorites** | Save favorite shops and products for quick reorder |
| **Scheduled Orders** | Order now, deliver at a specific time slot |
| **Subscription Orders** | Daily milk, weekly vegetables — recurring auto-orders |

**Note:** This phase requires backend migration. Static localStorage will not scale for a multi-user consumer marketplace.

### 4.2 Delivery Management

| Feature | Description |
|---|---|
| **Delivery Partner Pool** | Register delivery personnel (shop's own or gig workers) |
| **Auto Assignment** | Assign deliveries based on proximity and availability |
| **Route Optimization** | Optimal delivery route for multiple orders |
| **Live Tracking** | Real-time GPS tracking for customer and shop owner |
| **Proof of Delivery** | OTP verification or photo proof |
| **Delivery Charges** | Configurable per-km or flat-rate delivery fees |

### 4.3 Payments Integration

| Feature | Description |
|---|---|
| **Payment Gateway** | Razorpay / PhonePe / Paytm integration |
| **UPI Auto-collect** | Generate UPI payment links for invoices |
| **Digital Khata** | Track credit/debit between businesses with payment reminders |
| **WhatsApp Reminders** | Auto-send payment reminders via WhatsApp |
| **EMI Options** | Split high-value B2B orders into installments |
| **Settlement Reports** | Track platform commissions and payouts |

### 4.4 Mobile App

| Feature | Description |
|---|---|
| **Progressive Web App (PWA)** | Installable from browser, works offline |
| **Push Notifications** | New orders, low stock, payment received, delivery updates |
| **Offline Mode** | Full POS and inventory operations offline, sync when connected |
| **Camera Integration** | Barcode scanning, product photo capture |
| **Biometric Login** | Fingerprint/Face ID for quick access |

### 4.5 Advanced Features (Phase 3+)

| Feature | Description |
|---|---|
| **Multi-language** | Hindi, Marathi, Tamil, Telugu, Kannada, Gujarati, Bengali, English |
| **WhatsApp Commerce** | Share product catalog, accept orders via WhatsApp Business API |
| **AI Demand Forecasting** | Predict future demand based on sales history, seasonality |
| **Smart Reorder** | AI-suggested reorder quantities and timing |
| **Loyalty Programs** | Points, rewards, cashback for repeat customers |
| **QR Code Products** | Generate and scan QR codes for products |
| **Accounting Integration** | Export to Tally, Busy, or ZohoBooks |
| **Bank Statement Reconciliation** | Match payments with invoices automatically |

---

## 5. User Roles & Access Control

| Role | Inventory | Products & Pricing | POS | Orders (B2B) | Reports | Settings & Billing |
|---|---|---|---|---|---|---|
| **Owner** | Full | Full | Full | Full | Full | Full |
| **Manager** | View + Edit | View + Edit | Full | Full | Full | View only |
| **Cashier** | View only | View only | Full | View only | Daily summary only | None |
| **Delivery** | None | None | None | View assigned orders, update status | None | None |
| **Accountant** | View only | View only | View only | View only | Full | View only |
| **Customer** (Phase 2) | N/A | Browse published | N/A | Place & track own orders | N/A | Own profile |

### Role Assignment
- Business owner invites team members via email or phone number
- Each team member gets a role with permissions as above
- Owner can create custom roles with granular permissions (Phase 2)

---

## 6. Data Model

### 6.1 Entity Relationship Overview

```
Business (1) ----< (N) Location
Business (1) ----< (N) User (team members with roles)
Business (1) ----< (N) Product
Product  (1) ----< (N) StockEntry (per location, per batch)
Product  (1) ----< (N) PriceRule (wholesale, retail, MRP)
Product  (N) >----< (N) Category
Product  (1) ----< (N) BOMLine (ingredients/components)
Business (1) ----< (N) Order (as buyer or seller)
Order    (1) ----< (N) OrderItem
Business (1) ----< (N) POSSale
POSSale  (1) ----< (N) POSSaleItem
Business (1) ----< (N) Invoice
Business (1) ----< (N) KhataEntry (credit/debit ledger)
```

### 6.2 Core Entities

**Business**
| Field | Type | Description |
|---|---|---|
| id | string | Unique identifier |
| name | string | Business / shop name |
| type | enum | manufacturer, distributor, retailer, hybrid, home_business |
| gstin | string | GST Identification Number (optional) |
| phone | string | Primary contact number |
| email | string | Email address |
| address | object | Street, city, state, pincode |
| logo | string | Business logo URL |
| createdAt | datetime | Registration date |

**Product**
| Field | Type | Description |
|---|---|---|
| id | string | Unique identifier |
| businessId | string | Owner business |
| name | string | Product name |
| sku | string | Stock Keeping Unit code |
| hsnCode | string | HSN code for GST |
| categoryId | string | Category reference |
| unit | string | Primary unit (kg, piece, liter, etc.) |
| unitConversions | array | Conversion rules (e.g., 1 case = 24 pcs) |
| costPrice | number | Purchase/production cost |
| sellingPrice | number | Default selling price |
| wholesalePrice | number | Bulk buyer price |
| mrp | number | Maximum retail price |
| gstRate | number | GST percentage (0, 5, 12, 18, 28) |
| isPublished | boolean | Visible on B2B marketplace |
| isBOM | boolean | Is this a produced/manufactured item |
| bomLines | array | If BOM: list of ingredients with quantities |
| expiryTracking | boolean | Enable batch/expiry tracking |
| imageUrl | string | Product image |
| description | string | Product description |
| createdAt | datetime | Creation date |

**StockEntry**
| Field | Type | Description |
|---|---|---|
| id | string | Unique identifier |
| productId | string | Product reference |
| locationId | string | Location/warehouse reference |
| quantity | number | Current stock quantity |
| minStock | number | Minimum stock threshold for alerts |
| batchNumber | string | Batch/lot number (optional) |
| expiryDate | date | Expiry date (optional) |
| lastUpdated | datetime | Last stock change |

**Order**
| Field | Type | Description |
|---|---|---|
| id | string | Unique identifier |
| orderNumber | string | Human-readable order number (ORD-1001) |
| buyerId | string | Buyer business ID |
| sellerId | string | Seller business ID |
| items | array | List of order items (productId, name, qty, unitPrice) |
| subtotal | number | Sum before tax |
| taxAmount | number | GST amount |
| total | number | Grand total |
| status | enum | pending, approved, shipped, delivered, cancelled |
| paymentStatus | enum | unpaid, partial, paid |
| fulfillmentLocationId | string | Seller's shipping location |
| notes | string | Order notes |
| createdAt | datetime | Order placement date |
| updatedAt | datetime | Last status change |

**POSSale**
| Field | Type | Description |
|---|---|---|
| id | string | Unique identifier |
| receiptNumber | string | Receipt number (RCT-5001) |
| businessId | string | Business that made the sale |
| locationId | string | Location where sale occurred |
| items | array | Items sold (productId, name, qty, price, costPrice) |
| subtotal | number | Sum before tax |
| taxAmount | number | GST amount |
| total | number | Grand total |
| paymentMethod | enum | cash, upi, card |
| customerName | string | Walk-in customer name (optional) |
| customerPhone | string | Customer phone (optional) |
| createdAt | datetime | Sale timestamp |

**KhataEntry (Credit Ledger)**
| Field | Type | Description |
|---|---|---|
| id | string | Unique identifier |
| businessId | string | Business that owns this ledger |
| partyId | string | The other business (debtor/creditor) |
| orderId | string | Related order (if any) |
| type | enum | credit (they owe us), debit (we owe them) |
| amount | number | Amount |
| description | string | Note (e.g., "Payment for ORD-1042") |
| createdAt | datetime | Entry date |

**BOMLine (Bill of Materials)**
| Field | Type | Description |
|---|---|---|
| ingredientProductId | string | Raw material product reference |
| quantity | number | Quantity needed per unit of finished product |
| unit | string | Unit of measurement |
| wastagePercent | number | Expected wastage (e.g., 5%) |

---

## 7. User Flows

### 7.1 Onboarding Flow

```
Open App → Sign Up (business name, phone, email, password)
         → Select Business Type (manufacturer / distributor / retailer / hybrid / home)
         → Add First Location (name, address)
         → Add First Products (manual entry or bulk import)
         → Ready to use
```

### 7.2 Daily Retailer Flow (e.g., Medical Store)

```
Morning:  Open app → Check low-stock alerts → Place reorder (purchase order) to distributor
Daytime:  Open POS → Bill walk-in customers → Accept UPI/Cash → Auto-deduct stock
Evening:  Check dashboard → Review today's sales, profit → Export daily report
Monthly:  View GST summary → Download for filing → Check expiring stock
```

### 7.3 Hotel / Restaurant Flow

```
Morning:  Check ingredient inventory → Note what's low
          Go to marketplace → Order raw materials from suppliers
          Receive delivery → Stock auto-updates

Service:  Customer orders Paneer Butter Masala
          POS → Select "Paneer Butter Masala" → Bill generated
          System auto-deducts: 200g paneer, 100g tomato, 50g butter, spice mix
          Profit tracked: ₹220 sale - ₹14 ingredients = ₹206 gross profit

End of day: Dashboard shows → X dishes sold, total revenue, ingredient costs, net profit
```

### 7.4 Manufacturer → Distributor → Retailer Flow

```
MANUFACTURER:
  Purchases raw materials → Produces finished goods (BOM auto-deducts)
  Lists products on B2B marketplace at factory price (₹10/unit)
  Receives bulk orders from distributors

DISTRIBUTOR:
  Browses manufacturer's catalog → Orders 1000 units at ₹10
  Order delivered → Stock auto-added → Cost price set to ₹10
  Sets selling price to ₹15 → Publishes on marketplace
  Receives orders from retailers

RETAILER:
  Browses distributor's catalog → Orders 50 units at ₹15
  Order delivered → Stock auto-added → Cost price set to ₹15
  Sets selling price to ₹22 (MRP ₹25) → Sells via POS to walk-in customers
  Each sale: ₹22 - ₹15 = ₹7 profit per unit
```

### 7.5 B2C Consumer Flow (Phase 2)

```
Consumer opens ZatPat app → Location auto-detected
Sees nearby shops: "Sharma Medical", "Gupta Electronics", "Hotel Sai Prasad"
Browses Sharma Medical → Adds Crocin, Dettol, Bandages to cart
Checkout → Pays via UPI → Order placed

Shop owner sees new order → Accepts → Packs items
Delivery partner picks up → Consumer tracks live
Delivery → Consumer confirms via OTP → Done

Consumer rates: ⭐⭐⭐⭐⭐ "Fast delivery!"
```

---

## 8. Business Model & Monetization

### 8.1 Pricing Tiers

| Plan | Price | Features |
|---|---|---|
| **Free** | ₹0/month | 1 location, 50 products, POS, basic reports, 100 POS sales/month |
| **Pro** | ₹299/month | Unlimited locations, unlimited products, BOM/recipes, GST invoicing, advanced reports, unlimited POS |
| **Business** | ₹799/month | Everything in Pro + B2B marketplace, khata management, team roles, priority support, API access |
| **Enterprise** | Custom | White-label, custom integrations, dedicated support, SLA |

### 8.2 Transaction-Based Revenue (Phase 2)

| Source | Fee |
|---|---|
| **B2C Marketplace Commission** | 2-5% per consumer order (paid by seller) |
| **Delivery Fee** | ₹15-40 per delivery (paid by consumer, shared with delivery partner) |
| **Payment Processing** | ~2% gateway fee (passed through or absorbed in commission) |
| **Featured Listings** | ₹99-499/month for shops to appear at top of consumer search |
| **Advertising** | Promoted products in consumer marketplace feed |

### 8.3 Revenue Projections (Year 1 Targets)

| Metric | Month 6 | Month 12 |
|---|---|---|
| Registered businesses | 5,000 | 25,000 |
| Paid subscribers (Pro/Business) | 500 (10%) | 3,750 (15%) |
| Monthly subscription revenue | ₹2.5L | ₹18.75L |
| B2C orders/month (Phase 2) | — | 50,000 |
| B2C commission revenue/month | — | ₹5L |
| **Total MRR** | **₹2.5L** | **₹23.75L** |

---

## 9. Tech Architecture

### 9.1 MVP Architecture (Phase 1 — Static)

```
┌─────────────────────────────────────────────────────┐
│                    BROWSER                           │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ HTML     │  │ CSS      │  │ JavaScript        │  │
│  │ (Views)  │  │ (Styles) │  │ (Business Logic)  │  │
│  └──────────┘  └──────────┘  └───────────────────┘  │
│                                       │              │
│                              ┌────────▼────────┐     │
│                              │  localStorage   │     │
│                              │  (All Data)     │     │
│                              └─────────────────┘     │
└─────────────────────────────────────────────────────┘
                        │
                   Hosted on Vercel
                   (Static files, CDN)
```

**Stack:**
- HTML5, CSS3, vanilla JavaScript
- localStorage for all data persistence
- Chart.js for dashboard visualizations
- jsPDF for PDF generation
- Font Awesome for icons
- Google Fonts (Inter + Tiro Devanagari Marathi)
- Hosted on Vercel (free tier, global CDN)

**Pros:** Zero server cost, works offline, instant deployment, no database to manage
**Cons:** Single-device data (no sync), no multi-user, no real-time collaboration

### 9.2 Production Architecture (Phase 2 — Full Stack)

```
┌────────────┐     ┌────────────┐     ┌──────────────┐
│  Consumer   │     │  Business  │     │  Delivery    │
│  App (PWA)  │     │  Dashboard │     │  App (PWA)   │
└─────┬──────┘     └─────┬──────┘     └──────┬───────┘
      │                  │                    │
      └──────────────────┼────────────────────┘
                         │
                    ┌────▼─────┐
                    │  API     │      Next.js API Routes
                    │  Layer   │      or FastAPI
                    └────┬─────┘
                         │
          ┌──────────────┼──────────────┐
          │              │              │
    ┌─────▼─────┐ ┌─────▼─────┐ ┌─────▼──────┐
    │ Supabase  │ │ Supabase  │ │ Supabase   │
    │ Database  │ │ Auth      │ │ Storage    │
    │ (Postgres)│ │ (Users)   │ │ (Images)   │
    └───────────┘ └───────────┘ └────────────┘
```

**Migration path:**
1. Replace localStorage with Supabase (Postgres) — same data model, remote storage
2. Add Supabase Auth for multi-user authentication
3. Add real-time subscriptions for live order updates
4. Add Supabase Storage for product images
5. Deploy as Next.js app on Vercel

**Why Supabase:**
- Free tier is generous (500MB database, 50K monthly active users)
- Built-in auth, real-time, storage — no separate services needed
- Postgres underneath — can migrate to self-hosted if needed
- Row-level security for multi-tenant data isolation

---

## 10. Competitive Analysis

| Feature | ZatPat | Vyapar | Khatabook | Zoho Inventory | Udaan | Blinkit |
|---|---|---|---|---|---|---|
| **Inventory Management** | Yes | Yes | Basic | Yes | No | No |
| **POS Counter** | Yes | Yes | No | No | No | No |
| **B2B Marketplace** | Yes | No | No | No | Yes | No |
| **B2C Marketplace** | Phase 2 | No | No | No | No | Yes |
| **BOM / Recipes** | Yes | No | No | Yes | No | No |
| **GST Invoicing** | Yes | Yes | No | Yes | No | No |
| **Multi-location** | Yes | Paid | No | Yes | No | No |
| **Khata / Credit** | Yes | Yes | Yes | No | Yes | No |
| **Expiry Tracking** | Yes | No | No | Yes | No | No |
| **Free Tier** | Yes | Limited | Yes | Yes | N/A | N/A |
| **Target Audience** | All MSMEs | Retailers | Small shops | Mid-large | B2B buyers | Consumers |
| **Price** | ₹0-799/mo | ₹0-4999/yr | Free | $79+/mo | Free (commission) | N/A |

### ZatPat's Differentiators

1. **All-in-one:** No other tool combines inventory + B2B marketplace + B2C marketplace + POS + BOM in a single platform
2. **Universal:** Same tool works for a kirana store, a hotel, a manufacturer, and a home baker — competitors are niche
3. **Full chain:** Supports the entire value chain from manufacturer → distributor → retailer → consumer
4. **Affordable:** Free to start, Pro at ₹299/month — significantly cheaper than Zoho Inventory ($79/mo)
5. **India-first:** Built for Indian business patterns (khata, UPI, GST, Hindi/Marathi support)
6. **Offline-capable:** Static MVP works without internet; PWA mode in Phase 2

---

## 11. Phased Roadmap

### Phase 1 — MVP (Month 1-2)

**Goal:** Launchable product that a single business can use to manage inventory, bill customers, and trade with other businesses.

| Week | Deliverable |
|---|---|
| 1-2 | Universal inventory engine: multi-unit, multi-location, batch/expiry |
| 3 | Cost/pricing chain: cost price, selling price, wholesale price, MRP, margins |
| 4 | BOM/recipe management: define recipes, produce with auto-deduction |
| 5 | POS counter: product grid, billing, payment modes, receipt, daily summary |
| 6 | B2B marketplace: publish products, browse, cart, order workflow |
| 7 | GST & invoicing: tax calculation, GST-compliant invoice generation |
| 8 | Reports dashboard, dark theme, testing, and launch |

### Phase 2 — Growth (Month 3-4)

**Goal:** Multi-user, multi-device support with consumer marketplace.

| Deliverable |
|---|
| Backend migration: Supabase database + auth + real-time |
| Multi-user: team roles (owner, manager, cashier, delivery) |
| B2C consumer marketplace: shop discovery, browsing, ordering |
| Payment gateway integration (Razorpay) |
| PWA: installable, push notifications |

### Phase 3 — Scale (Month 5-6)

**Goal:** Delivery infrastructure and broader reach.

| Deliverable |
|---|
| Delivery management: partner assignment, live tracking, OTP verification |
| WhatsApp Business API: order notifications, payment reminders, catalog sharing |
| Multi-language support: Hindi, Marathi (add more based on user geography) |
| Offline mode with background sync |
| Advanced analytics: trends, forecasting basics, slow-mover analysis |

### Phase 4 — Intelligence (Month 7+)

**Goal:** AI-powered features and marketplace maturity.

| Deliverable |
|---|
| AI demand forecasting and smart reorder suggestions |
| Customer loyalty and rewards program |
| Subscription/recurring orders |
| React Native mobile app (if PWA limitations are hit) |
| Accounting integration (Tally, Busy export) |
| Bank statement reconciliation |

---

## 12. Success Metrics & KPIs

### Acquisition Metrics
| Metric | Month 3 Target | Month 6 Target | Month 12 Target |
|---|---|---|---|
| Registered businesses | 500 | 5,000 | 25,000 |
| Monthly new sign-ups | 200 | 1,000 | 3,000 |
| Business types represented | 5+ | 8+ | 12+ |

### Engagement Metrics
| Metric | Target |
|---|---|
| Daily Active Businesses (DAB) | 30%+ of registered |
| POS transactions per active business | 10+/day |
| B2B orders per active business | 2+/week |
| Average session duration | 8+ minutes |

### Revenue Metrics
| Metric | Month 6 Target | Month 12 Target |
|---|---|---|
| Paid conversion rate | 10% | 15% |
| Monthly Recurring Revenue (MRR) | ₹2.5L | ₹23.75L |
| Gross Merchandise Value (B2B) | ₹50L/month | ₹5Cr/month |
| Gross Merchandise Value (B2C) | — | ₹25L/month |

### Retention Metrics
| Metric | Target |
|---|---|
| 7-day retention | 60%+ |
| 30-day retention | 40%+ |
| 90-day retention | 25%+ |
| Monthly churn (paid) | <5% |

---

## 13. Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|---|---|---|---|
| **Data loss (localStorage)** | High | Medium | Auto-export/backup to file; migrate to cloud in Phase 2 |
| **Single-device limitation** | High | High | Clearly communicate in MVP; prioritize cloud sync in Phase 2 |
| **Low adoption in Tier 2/3** | High | Medium | Keep UI extremely simple; add local language support early |
| **Competition from Vyapar/Khatabook** | Medium | High | Differentiate with B2B marketplace + BOM — features they don't have |
| **Scaling static architecture** | High | Certain | Planned migration path to Supabase in Phase 2 |
| **GST compliance accuracy** | High | Low | Consult CA for validation; add disclaimer for user verification |
| **Delivery logistics (Phase 2)** | High | Medium | Start with shop's own delivery; add gig partners gradually |
| **Payment gateway integration** | Medium | Low | Use Razorpay (well-documented, good support for startups) |
| **User training/onboarding** | Medium | High | In-app guided tours, demo data, YouTube tutorials in Hindi |

---

## Appendix: Business-Specific Scenarios

### A1. Medical Store (Retailer)

**Setup:** Categorize products (Tablets, Syrups, Injections, Surgical, OTC). Enable expiry tracking.

**Daily workflow:**
- Morning: Check expiry alerts (products expiring in 30 days). Check low-stock alerts.
- Place purchase order to pharma distributor via B2B marketplace.
- Throughout day: Bill customers via POS. System checks expiry — warns if dispensing near-expiry stock.
- Generate GST invoice for each sale (required for Schedule H drugs).
- End of day: Review daily P&L. Check which medicines are slow-moving.

**Unique needs:** Expiry date is legally critical. Batch tracking for recall scenarios. Drug schedule classification.

### A2. Car Garage / Service Center (Hybrid)

**Setup:** Products include spare parts AND services. Create BOMs for common services.

**BOM examples:**
- "Full Service" = Engine oil 4L + Oil filter + Air filter + Labor 2hrs
- "Brake Pad Replacement" = Brake pads (set) + Brake fluid 500ml + Labor 1hr

**Workflow:**
- Customer arrives → Create POS bill → Select "Full Service"
- System auto-deducts parts from inventory → Calculates total cost
- Charge customer ₹3500 (cost was ₹1800 in parts + ₹500 labor = ₹2300)
- Profit: ₹1200

**Unique needs:** Service items with labor component. Vehicle tracking (which car got which service).

### A3. Hotel / Restaurant (Hybrid)

**Setup:** Raw materials as products (vegetables, spices, oil, etc.). Menu items as BOM products.

**BOM examples:**
- "Dal Fry" = Toor dal 200g + Onion 100g + Tomato 50g + Oil 30ml + Spice mix 10g
- "Thali" = Dal Fry (sub-BOM) + 3 Roti (sub-BOM) + Rice 200g + Salad

**Workflow:**
- Morning: Check ingredient stock → Order low items from vegetable vendor (B2B)
- Service: Waiter enters orders on POS (tablet) → Kitchen prepares
- Each dish sold auto-deducts all ingredients from stock
- End of day: Dashboard shows total revenue, ingredient cost, and food cost percentage
- Target: Keep food cost under 30% of selling price

**Unique needs:** Nested BOMs (thali contains dal which contains sub-ingredients). Daily menu management. Food cost percentage tracking.

### A4. Manufacturer (Producer)

**Setup:** Raw materials and finished goods. BOM for each product.

**BOM example:**
- "Soap Bar (Lavender)" = Soap base 200g + Lavender oil 5ml + Color 2g + Wrapper 1pc

**Workflow:**
- Purchase raw materials from suppliers (B2B marketplace or manual entry)
- Production run: "Produce 500 bars of Lavender Soap"
- System deducts: 100kg soap base, 2.5L lavender oil, 1kg color, 500 wrappers
- 500 bars added to finished goods inventory at calculated cost (₹12/bar)
- Publish on B2B marketplace at ₹18/bar (50% margin)
- Distributors order in bulk → Ship → Stock auto-adjusts

**Unique needs:** Large-scale production runs. Yield tracking. Batch numbering for traceability.

### A5. General Store / Kirana Shop (Retailer)

**Setup:** Wide product range (200-2000 SKUs). Multiple categories. Simple POS.

**Workflow:**
- Restock from distributor weekly (B2B orders or manual purchase entry)
- Daily POS billing for walk-in customers (mostly cash + UPI)
- Track slow-moving items (products sitting on shelf for 60+ days)
- Manage credit for regular customers (khata) — "Sharma ji ka ₹450 baaki hai"
- Monthly: Check overall profit, compare with last month

**Unique needs:** Very fast POS (customers don't wait). Khata/credit management for regulars. Simple, no-learning-curve UI.

### A6. Home Baker / Tiffin Service (Home Business)

**Setup:** Small product range. Simple recipes. No physical shop.

**Workflow:**
- Purchase ingredients from local market (manual entry)
- Define recipes for products (Chocolate Cake, Veg Thali, Achar)
- Receive orders via WhatsApp → Enter in ZatPat → Produce → Mark delivered
- Track ingredient costs vs selling price → Know exact profit per order
- Phase 2: List products on B2C marketplace → Customers in locality can order directly

**Unique needs:** Super simple interface. WhatsApp integration for orders. Small-scale production tracking. Online storefront for discoverability.

---

*This document is a living specification. It will be updated as user research, market feedback, and technical discoveries inform the product direction.*

---

**Document version history:**

| Version | Date | Changes |
|---|---|---|
| 1.0 | March 2026 | Initial MVP document — full PRD, business model, roadmap, architecture |

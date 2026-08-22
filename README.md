# PharmaCore Pharmacy System

PharmaCore is a full-stack pharmacy management system built for local pharmacy workflows such as medicine management, purchasing, inventory tracking, cashier sales, alerts, and reporting.

## Highlights
- Secure login with JWT authentication
- User roles: `ADMIN`, `PHARMACIST`, `CASHIER`
- Dashboard with medicine, sales, and stock summaries
- Medicines workspace with barcode search, prefix search, filters, import, and export
- Purchase invoices with supplier tracking and payment status
- POS / cashier flow with barcode lookup, cart, discounts, and returns
- Inventory tracking with stock movement history, low-stock alerts, expired alerts, and manual adjustments
- Reports for daily sales, monthly sales, profit, suppliers, low stock, and expiry
- Fractional medicine sales by `BOX`, `STRIP`, or `PILL`
- Box-level allocation tracking for packaged medicines
- Cashier shift opening, reconciliation, and closing reports
- Customer credit limits, receivables ledger, and payment recording
- Barcode-first physical inventory counts with reviewed stock adjustments

## Tech Stack
- Backend: `Node.js`, `Express`, `Prisma`, `SQLite`, `JWT`
- Frontend: `React`, `Vite`, `Axios`

## Project Structure
```text
backend/
  prisma/
  src/
frontend/
  src/
package.json
README.md
```

## Main Features

### Authentication
- Login and protected routes
- Role-based access control
- User management
- Password reset and self-service password change

### Medicines
- Add, edit, delete, and view medicines
- Search by name, barcode, category, and manufacturer
- Barcode lookup
- Bulk add
- Excel-compatible CSV import
- Excel export
- Pagination and filtering

### Purchases
- Create purchase invoices
- Add multiple medicines in one invoice
- Supplier association
- Payment status tracking
- Purchase returns
- Load an already saved invoice by invoice number

### Sales
- Fast POS workflow
- Barcode scan / manual barcode entry
- Cart management
- Discount and payment method
- Invoice details and reprint-ready view
- Refund / full sale return
- Cash, card, transfer, and customer-credit payments
- Automatic association with the active cashier shift

### Cashier Shifts
- Open a shift with an opening cash balance
- Review invoices by payment method
- Compare expected cash with the physical drawer count
- Track shortages and overages in the shift history

### Customer Accounts
- Set a credit limit per customer
- Create credit sales directly from the POS
- Record customer payments and review the full ledger
- Reverse credit balances automatically when a sale is returned

### Inventory
- Stock quantity tracking
- Low-stock alerts
- Expired and expiring-soon alerts
- Manual stock adjustment
- Stock movement history
- Persistent barcode-based inventory count sessions
- Review count differences before applying them to stock

### Fractional Packaging
- Sell full box
- Sell full strip
- Sell single pill
- Track which physical box was used
- Deplete the box automatically when all units are sold

### Reports
- Daily sales
- Monthly sales
- Estimated profit
- Supplier summary
- Low-stock report
- Expiry report
- Excel and PDF export

## Default Accounts
- Admin: `admin@pharmacy.com` / `admin123`
- Pharmacist: `pharmacist@pharmacy.com` / `pharma123`
- Cashier: `cashier@pharmacy.com` / `cashier123`

These accounts are intended for local development only. Change all default passwords and set a strong `JWT_SECRET` before production use. Public self-registration is disabled; admins manage employee accounts from the Users workspace.

## Local Setup

### 1. Prepare everything
```bash
npm run setup
```

This command will:
- create `backend/.env` automatically when it is missing
- generate a random local JWT secret
- install backend and frontend dependencies before database setup
- generate Prisma Client explicitly (including on npm versions that restrict install scripts)
- run Prisma database push
- create the SQLite schema
- seed default users and sample medicines
- verify that the frontend can produce a complete Vite build

### 2. Start the project
```bash
npm run dev
```

`npm run dev` also performs a preflight check. If dependencies, the local database, or the generated Prisma Client are missing, it runs the required setup automatically before starting.

## Local URLs
- Frontend: [http://localhost:5173](http://localhost:5173)
- Backend API: [http://localhost:5000](http://localhost:5000)

## Phone Access
When both devices are on the same Wi-Fi:

1. Start the project with `npm run dev`
2. Open `http://YOUR-PC-IP:5173` on the phone
3. The frontend will proxy `/api` calls to the backend during development

## Purchase Invoice Notes
- `New invoice number` is used to create a brand-new purchase invoice
- `Load existing invoice` is used only for an invoice that is already saved in the system
- Loading by invoice number fills invoice items automatically from purchase history

## Fractional Sale Notes
- Packaged medicines can be configured using:
  - `stripsPerBox`
  - `pillsPerStrip`
  - optional strip and pill selling prices
- Inventory is tracked in base units internally while preserving box-level traceability

## Production

### Backend
```bash
cd backend
npm install
npm start
```

### Frontend
```bash
cd frontend
npm install
npm run build
```

## Repository Notes
- Local environment files are ignored
- Local Prisma / SQLite database files are ignored
- `node_modules` is ignored
- The distributable ZIP is intentionally dependency-free and creates its local environment during setup

## Status
This repository currently includes the completed foundation, authentication, medicines, purchases, inventory, sales, reports, and fractional packaging workflow.

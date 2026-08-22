# PharmaCore Backend v1

## Features
- Express API
- SQLite + Prisma
- JWT login with email or username
- Public registration with isolated pharmacy workspaces
- Password recovery by email code (SMTP)
- Protected routes
- Dashboard summary
- Medicines CRUD
- Low stock alert endpoint
- Seed admin and sample medicines
- Cashier shift reconciliation
- Customer credit ledger and payments
- Persistent barcode inventory counts

## Setup

1. Install packages:

```bash
npm install
```

2. Prepare the environment, Prisma Client, database, and seed data:

```bash
npm run setup
```

The setup command creates `backend/.env` automatically if it is missing.

3. Run:

```bash
npm run dev
```

## Login
Email: admin@pharmacy.com  
Username: admin  
Password: admin123

## Password recovery email

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` in `.env`.
For Gmail, use `smtp.gmail.com`, port `587`, and a Google App Password rather than the normal account password.

## Main APIs
- GET `/`
- POST `/api/auth/login`
- POST `/api/auth/register` (public; creates an empty isolated pharmacy)
- POST `/api/auth/forgot-password`
- POST `/api/auth/reset-password`
- GET `/api/auth/me` with Bearer token
- GET `/api/dashboard/summary` with Bearer token
- GET `/api/medicines` with Bearer token
- POST `/api/medicines` with Bearer token
- PUT `/api/medicines/:id` with Bearer token
- DELETE `/api/medicines/:id` with Bearer token
- GET `/api/medicines/low-stock` with Bearer token
- GET/POST `/api/shifts` with Bearer token
- POST `/api/shifts/:id/close` with Bearer token
- GET `/api/customers/:id/account` with Bearer token
- POST `/api/customers/:id/payments` with Bearer token
- GET/POST `/api/inventory/counts` with Bearer token
- POST `/api/inventory/counts/:id/complete` with Bearer token

For production, replace all seeded passwords and set a long random `JWT_SECRET`.

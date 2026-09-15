# 🪔 Swarup Stationery Store

A premium Durga-Puja-themed **digital shop notebook** for a real stationery/general store — simple for the shopkeeper on the outside, professional billing + inventory + Khata system underneath.

**Daily flow:** Home → Sell → Payment → Done · Purchase → Stock → Done · Customer → Credit → Khata → Receive Payment

[![Node >= 20](https://img.shields.io/badge/node-%3E%3D20-green)]() [![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-green)]() [![License: MIT](https://img.shields.io/badge/License-MIT-yellow)]()

## ✨ Features

**🛒 POS (Sell)** — product search (English/বাংলা/SKU/barcode), barcode/QR camera scan, voice sale with review, cart with quantity steppers, flat + % discount, hold/resume cart, Cash (auto change) / UPI exact-amount QR / Due / Mixed split, customer attach, printable receipt (normal + 80mm thermal), PDF + WhatsApp share.

**📦 Products** — Bengali names, categories, units + pack sizes (e.g. 1 packet = 10 cigarettes), purchase/sell prices with margin %, stock + low-stock alerts, barcode/SKU, photos (URL/upload/camera via Cloudinary), price history, full stock ledger, barcode price-label printing.

**📥 Purchase & Flipkart bills** — manual purchase, supplier dues tracking, **Flipkart invoice PDF one-tap import**: upload PDF → items auto-read → fuzzy match / auto-create products → stock added once → purchase recorded. Duplicate-bill + math-mismatch protection.

**📒 Khata (customer credit)** — dues ledger, receive payment (overpay blocked), credit limits with block + warning, WhatsApp due reminders, call button, statement PDFs, per-customer timeline.

**🏭 Supplier dues** — credit purchases grouped by supplier, pay with FIFO bill adjustment.

**↩ Returns** — item-level sales return with stock restore, refund tracking, khata auto-adjust, return-aware profit reports.

**📊 Reports** — daily P&L, payment split, hour-wise chart, product-wise profit, dead-stock finder, date ranges, Bengali/English PDFs, CSV/JSON export, WhatsApp daily summary, one-click full backup.

**🛠 Admin** — dashboard alerts, staff accounts with permissions, audit log, business-day close with **cash tally**, system health.

**🎨 Experience** — Puja-themed PWA (installable, works on Android), Bengali + English UI, offline banner, error boundaries (never a silent white screen).

## 🏗 Architecture

```
Android/Web (PWA)
       ↓
Vercel (frontend)  →  HTTPS  →  Render (Express API)  →  MongoDB Atlas
                                              ↓
                                   Cloudinary (images/bills/QR)
                                              ↓
                                   Gemini AI (backend only, optional)
```

| Part | Stack |
|---|---|
| Frontend | Vite + React 18 + TypeScript, PWA-ready |
| Backend | Node 20+ + Express + Mongoose, JWT + bcrypt |
| Database | MongoDB Atlas (`swarup-store`) |
| Media | Cloudinary (local-disk fallback in dev only) |
| AI | Gemini via backend (heuristic fallback without key) |

## 🚀 Run locally

**Needs:** Node 20+, MongoDB running locally.

```bash
# 1. Backend
cd backend
cp .env.example .env   # set MONGO_URI, JWT_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD
npm install
npm start              # first boot creates the admin + default categories
# → http://127.0.0.1:5000  (health: /api/health)

# 2. Frontend (new terminal)
cd frontend
npm install
npm run dev -- --host --port 8080
# → http://localhost:8080
```

Login with your `ADMIN_USERNAME` / `ADMIN_PASSWORD`.

## ☁️ Deploy

**Render (backend)** — New Web Service from this repo; `render.yaml` is included (build/start/health check). Set env vars:

```
NODE_ENV=production  PORT=10000  MONGO_URI=mongodb+srv://...  JWT_SECRET=<32+ chars>
JWT_EXPIRES_IN=7d  CLIENT_ORIGIN=https://<your-frontend>.vercel.app
ADMIN_USERNAME  ADMIN_PASSWORD  ADMIN_NAME
GEMINI_API_KEY (optional)  CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET (optional)
```

**Vercel (frontend)** — import repo, Root Directory = `frontend`, add env `VITE_API_BASE_URL=https://<render-backend>`, deploy. Then disable *Deployment Protection → Vercel Authentication* so customers can open the app (the app has its own login).

**MongoDB Atlas** — database `swarup-store`, app user with `readWrite`, network access for Render IPs (`0.0.0.0/0` on Free tier compatible setups).

## 🧪 Tests

```bash
npm test --prefix backend   # 22 unit/integration tests (math, stock, idempotency, Flipkart parser…)
node backend/tests/sweep.js # 50-check live API sweep (FULL=1 on an isolated DB for write paths)
node backend/tests/flipkart-e2e.js  # real-PDF Flipkart flow (isolated DB)
```

Key invariants, all server-enforced: totals computed server-side · stock moves exactly once per transaction (voids reverse once, full ledger) · idempotent sales · historical price snapshots for profit · no negative stock unless enabled · UPI confirmation is manual (never faked).

## 📁 Layout

```
backend/   src/{config,models,routes,services,utils}  tests/  assets/fonts/
frontend/  src/{pages,components,api,i18n,theme}  public/
render.yaml  README.md  LICENSE
```

## 📜 License

MIT — see [LICENSE](LICENSE).

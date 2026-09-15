# 🪔 Swarup Stationery Store

Premium Durga-Puja-themed digital shop notebook on the outside, professional billing + inventory + Khata system underneath.

**Daily flow:** Home → Sell → Payment → Done · Purchase → Stock → Done · Customer → Credit → Khata → Receive Payment

## Architecture

```
Android/Web → Vercel (frontend) → HTTPS → Render (Express API) → MongoDB Atlas
                                                        ↘ Cloudinary (images/bills/QR) · Gemini (AI, backend only)
```

## Run locally

Backend:
```
cd backend
copy .env.example .env   # set MONGO_URI, JWT_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD
npm install
npm start                # first boot creates admin from ADMIN_USERNAME/ADMIN_PASSWORD + default categories
```

Frontend:
```
cd frontend
# set VITE_API_BASE_URL=https://<render-backend>  (blank = same-origin / vite proxy in dev)
npm install
npm run dev
```

## Live deployment (2026-09-15)

- Frontend (Vercel, project `frontend`, scope `nexoria3`): https://swarup-store-nexoria3.vercel.app
  - Deploy from `frontend/` dir (Vercel Root Directory = `frontend`); SPA rewrites in `frontend/vercel.json`.
  - After the Render backend exists: `vercel env add VITE_API_BASE_URL production` (or Dashboard → Project → Settings → Environment Variables), then `vercel deploy --prod --yes` from `frontend/`.
  - Dashboard → Project → Settings → Deployment Protection → turn OFF "Vercel Authentication" so the shopkeeper can open the app (app has its own JWT login).
- Backend (Render): create Web Service from this repo — `render.yaml` already defines build/start/health check. Set env vars below. Note required `CLIENT_ORIGIN=https://swarup-store-nexoria3.vercel.app`.
- Database: MongoDB Atlas `swarup-store`, app user with readWrite, network access for Render; set `MONGO_URI`.
- Media/AI: Cloudinary + `GEMINI_API_KEY` optional (local-disk fallback dev-only; heuristic voice/invoice parsers otherwise).

Health: `GET /api/health` → `{ ok, time, database }`

## Required environment (Render backend)

NODE_ENV, PORT, MONGO_URI, JWT_SECRET, JWT_EXPIRES_IN, CLIENT_ORIGIN,
ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_NAME,
GEMINI_API_KEY (optional — voice/invoice fall back to heuristics),
CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET (optional — local fallback in dev only)

Frontend: `VITE_API_BASE_URL` only. Never put secrets in `VITE_*`.

## Key invariants (server-enforced)

- Server calculates subtotal/discount/tax/total/paid/due/profit/stock — never trusts client totals.
- Stock moves exactly once per committed sale/purchase; voids reverse exactly once; every move → `stockMovements` ledger.
- Sales carry `idempotencyKey` (unique) — repeats return the same sale.
- Transactions on replica set/Atlas; compensated rollback + idempotency on standalone MongoDB.
- Historical prices snapshotted per sale; profit uses snapshots, never current prices.
- Duplicate invoices blocked on supplier+invoice/order number (not just exact-total fingerprint).
- UPI QR is exact-amount intent; confirmation is manual (no fake auto-success).
- Bengali PDFs embed Noto Sans Bengali (`backend/assets/fonts`).

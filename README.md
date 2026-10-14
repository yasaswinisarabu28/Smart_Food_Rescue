# Smart Food Rescue (MERN)

A full-stack MVP that connects surplus food donors with recipients. It includes user registration/login, role checks, food listing creation, search/category filters, atomic claim handling, and rescue completion.

## Requirements
- Node.js LTS and npm
- MongoDB Atlas account (or a local MongoDB instance)
- VS Code

## 1. Configure MongoDB and backend

In MongoDB Atlas, create a free cluster, create a database user, allow your current IP in Network Access, and copy the Node.js connection string. Replace the username/password placeholders and encode special characters in the password if needed.

```bash
cd server
npm install
```

Copy `.env.example` to `.env`, then edit `MONGODB_URI` and `JWT_SECRET`. Keep `.env` private and never commit it.

Windows PowerShell:
```powershell
Copy-Item .env.example .env
```

macOS/Linux:
```bash
cp .env.example .env
```

Start the API:
```bash
npm run dev
```
It should report that MongoDB is connected and the API is running on port 5000. Check `http://localhost:5000/api/health`.

## 2. Start the frontend in a second terminal

```bash
cd client
npm install
```

Optional: copy `.env.example` to `.env` if you need to change the API URL. The default is `http://localhost:5000/api`.

```bash
npm run dev
```
Open the local URL Vite prints, usually `http://localhost:5173`.

## 3. Test the main workflow

1. Register a **donor** account.
2. Click **Donate food** and publish a listing with a future pickup deadline.
3. Log out.
4. Register a separate **recipient** account using a different email.
5. Find the listing and click **Claim this food**.
6. Log out and log back in as the donor to see the claim.
7. The donor or claiming recipient can mark the rescue complete.

## API routes

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/food?status=available&category=all&search=`
- `GET /api/food?mine=true&status=all` (requires bearer token)
- `POST /api/food` (donor)
- `POST /api/food/:id/claim` (recipient)
- `PATCH /api/food/:id/complete` (donor or claiming recipient)

## Important MVP limitations

- This is a student MVP, not a production food-safety or emergency-response service.
- Listings use a single all-or-nothing claim; partial quantity claims, organization verification, image uploads, and email/real-time notifications are not included yet.
- The current browser demo stores the JWT in localStorage for simplicity. For a production deployment, prefer secure, HTTP-only cookies, rate limiting, CSRF protections where applicable, audit logging, and stronger operational controls.
- The impact strip reflects the currently loaded result set, not an independently aggregated platform-wide report.
- Before using with real food, add clear allergen, storage, preparation, and safe pickup procedures.

## Git hygiene

The `.env` file is intentionally not included. Add secrets only to local environment variables or hosting provider settings.


## RescueBite fixes and setup

1. Copy `server/.env.example` to `server/.env` and set `MONGODB_URI`, `JWT_SECRET`, and optionally `CLIENT_URL=http://localhost:5173`.
2. From `server`, run `npm install`, then `npm run migrate` once to add `remainingQuantity` and migrate legacy claims. Back up MongoDB first.
3. Start the API with `npm run dev` (or `npm start`, depending on scripts).
4. From `client`, run `npm install` and `npm run dev`.
5. Log in with the same email and password used at registration. Emails are trimmed and case-normalized; passwords remain case-sensitive. Existing account passwords cannot be recovered from their bcrypt hash; if a password is genuinely unknown, use a password-reset feature (not included here) or create a new account with a different email.

Existing donations remain in MongoDB and are filtered by the logged-in donor ID in **My donations**. Public marketplace shows available listings from all donors. Make sure the app and backend use the same `MONGODB_URI` database and only one API server is running on port 5000.

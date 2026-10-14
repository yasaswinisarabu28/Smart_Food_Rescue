# Smart Food Rescue (MERN)

Smart Food Rescue connects surplus food donors with recipients. This version includes quantity-based reservations, a recipient **My Claims** page, safe reservation cancellation with stock restoration, and a donor dashboard for reviewing recipient details and tracking each reservation through confirmation, pickup, and completion.

## Features

- Register and log in as a donor or recipient.
- Donors can publish food listings with a quantity, unit, pickup location, and deadline.
- Recipients can reserve a selected quantity using the quantity selector.
- Recipients can view their claims and cancel a reservation that is still `reserved` or `confirmed`.
- Cancellation restores stock and prevents duplicate cancellations or stock exceeding the original quantity.
- Donors can view claims only for their own food listings, including recipient name/email, reserved quantity, reservation time, location, and pickup deadline.
- Donors can move claims through `reserved` → `confirmed` → `picked_up` → `completed`.
- Backend role/ownership checks protect claim status updates and cancellation.

## Requirements

- Node.js LTS and npm
- MongoDB Atlas or a local MongoDB instance
- VS Code

## 1. Configure MongoDB and backend

In MongoDB Atlas, create a database user, allow your current IP in Network Access, and copy the Node.js connection string. Replace the username/password placeholders and encode special characters in the password if necessary.

```bash
cd server
npm install
```

Copy `server/.env.example` to `server/.env` and set `MONGODB_URI` and `JWT_SECRET`. Keep `.env` private and never commit it.

Windows PowerShell (from the `server` folder):

```powershell
Copy-Item .env.example .env
```

Start the API:

```bash
npm run dev
```

The API should report that MongoDB is connected and it is running on port 5000. Check `http://localhost:5000/api/health`.

### Database migration note

If your database was already migrated to the quantity-based `Food` and `Claim` models, **do not run the migration again just because you replaced these files**. If you are upgrading an older database that still uses the original embedded `Food.claim` structure, take a database backup first, then run the one-time migration from the `server` folder:

```bash
npm run migrate:claims
```

The migration is written to avoid duplicate claim records, but a backup is still recommended before database changes.

## 2. Start the frontend in a second terminal

From the project root, open a second terminal:

```bash
cd client
npm install
npm run dev
```

The default API URL is `http://localhost:5000/api`. To change it, copy `client/.env.example` to `client/.env` and set `VITE_API_URL`.

Open the local URL Vite prints, usually `http://localhost:5173`.

## 3. Test the complete workflow

1. Register a **donor** account.
2. Publish a food listing with a future pickup deadline and a quantity greater than zero.
3. Log out and register a **recipient** account with a different email.
4. Find the listing and reserve a quantity.
5. Open **My claims** as the recipient. Confirm the reserved quantity is listed; test cancellation on a reservation that has not been picked up.
6. Log in as the donor and open **Claims received**.
7. Check the recipient name/email and reserved quantity.
8. Click **Confirm reservation**, then **Mark picked up**, then **Complete rescue**, refreshing the page between actions if you need to verify stored statuses.

## API routes

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/food?status=available&category=all&search=`
- `GET /api/food?mine=true&status=all` (bearer token required)
- `GET /api/food/my-claims` (recipient)
- `GET /api/food/donor-claims` (donor; own listings only)
- `POST /api/food` (donor)
- `POST /api/food/:id/claim` (recipient; JSON `{ "quantity": 2 }`)
- `PATCH /api/food/claims/:claimId/cancel` (recipient; their own reserved/confirmed claim)
- `PATCH /api/food/claims/:claimId/status` (donor; `{ "status": "confirmed" }` or `{ "status": "picked_up" }`)
- `PATCH /api/food/claims/:claimId/complete` (donor or recipient involved in the claim)

## Important MVP limitations

- This is a student MVP, not a production food-safety or emergency-response service.
- Status and stock updates use guarded MongoDB operations, but a production deployment should use MongoDB transactions for operations that must update multiple documents atomically; transactions require a replica set.
- Recipient email is shown only to the donor who owns the food listing associated with the claim.
- The browser demo stores the JWT in `localStorage` for simplicity. For production, consider secure HTTP-only cookies, rate limiting, CSRF protections where applicable, audit logging, and stronger operational controls.
- Impact-strip values reflect the currently loaded result set, not independent platform-wide aggregate reporting.
- Before using this with real food, add clear allergen, storage, preparation, and safe pickup procedures.

## Git hygiene

The `.env` files are intentionally excluded. Add secrets only to local environment variables or hosting provider settings.


## In-app notifications

The app includes an authenticated notification center. Donors are notified when recipients reserve food; recipients are notified when donors confirm or mark a reservation picked up; both parties receive notifications when a reservation is cancelled or completed. Use the bell in the header to view notifications and mark them as read. Notifications are stored in MongoDB and are scoped to the signed-in user.

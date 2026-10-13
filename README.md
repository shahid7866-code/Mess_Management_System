# MessMate

MessMate is a Next.js App Router application for managing meal subscriptions, attendance, menus, payments, and expenses.

## Local setup

1. Install dependencies with `npm install`.
2. Ensure MongoDB Server is running and copy `.env.example` to the root `.env.local`.
3. Set `MONGODB_URI` in `.env.local`. Do not commit that file.
4. Start the application with `npm run dev` and open `http://localhost:3000`.
5. Check database connectivity at `http://localhost:3000/api/health`.

## Payment settings and QR image storage

Administrators configure the real mess UPI ID and optional QR image in the **Payments** section. The settings record is stored in MongoDB. QR files are kept outside `public/` in `PAYMENT_QR_STORAGE_DIR` (default: `.private-uploads/payment-qr`) and served through an authenticated, non-cacheable route. Use a persistent private disk mount for this directory in production, and point every app instance at the same durable storage location. The default local directory is suitable for development; ephemeral serverless disks will not preserve uploaded images across restarts or instances.

MongoDB Compass is a database client; it does not start MongoDB Server.

## First administrator

There is no public administrator registration. Set `ADMIN_INITIAL_PASSWORD` in the shell running the command, then run:

```text
npm run admin:create -- <student-id> <full-name> <email>
```

The command refuses to create another administrator if one already exists. The initial password must be at least 12 characters and is hashed with bcrypt before storage. Do not place it in source control or a command transcript.

To reset an existing administrator's password, set `ADMIN_RESET_PASSWORD` in the shell running the command and pass their student ID or email:

```text
npm run admin:reset-password -- <student-id-or-email>
```

The reset command only updates an existing administrator account, revokes that administrator's sessions, and hashes the new password with bcrypt before storage. The new password must be at least 12 characters.

## Checks

```text
npx tsc --noEmit
npm run lint
npm run build
npm run test:models
npm run test:api
npm run test:auth
npm run test:students
npm run test:meals
npm run test:finance
npm run test:portal
```

Integration tests connect to MongoDB, verify a generated database name is unused, and only remove that isolated test database after the run.

## Business policies

- Subscription dates are half-open intervals: start inclusive, end exclusive.
- Afternoon and Night each cost 150,000 paise per calendar month; Both costs 300,000 paise.
- Billing charges the full monthly price for every calendar month touched by the subscription interval. Partial months are not prorated. This is the current documented policy.
- Money is persisted as integer paise. INR values are presentation-only.
- Meal service dates and windows use `Asia/Kolkata`. Default windows are 11:00–14:00 for Afternoon and 18:00–22:00 for Night; administrators can change them. Closing time is exclusive.
- A holiday blocks attendance unless an administrator explicitly enables an exception and provides a reason.
- No attendance document means Not Marked, not Absent. Corrections retain the previous and new statuses, operator, timestamp, and reason.
- Payments represent funds recorded as received by an administrator; no payment gateway is configured. Reversals are audit records and do not delete the original payment.
- Financial reports distinguish accrued subscription charges, received collections, outstanding balances, and recorded expenses. Collections minus expenses is labeled net cash movement, not accounting profit.

## Operational limitations

- Login throttling is process-local. Production deployments with multiple instances should move it to a shared rate-limit store.
- Subscription-overlap and payment-balance writes use short-lived per-document MongoDB leases so local standalone MongoDB is supported. A multi-instance deployment should monitor lock timeouts and may move to a replica set and transaction-based workflows.
- Attendance closes by evaluating the persisted meal window at request time; no scheduled background worker is configured.
- The dashboard's remaining navigation destinations and some visual foundation elements may still be under development. Only screens backed by the APIs described above should be treated as functional records.

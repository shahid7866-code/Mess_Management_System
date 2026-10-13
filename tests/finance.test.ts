import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import mongoose from "mongoose";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ApiError } from "../src/lib/api-response";
import { connectDB } from "../src/lib/mongodb";
import { fullCalendarMonthsBilled, subscriptionChargePaise } from "../src/lib/billing";
import {
  getFinancialReport,
  getSubscriptionLedger,
  recordExpense,
  recordPayment,
  reverseExpense,
  reversePayment,
} from "../src/lib/finance-service";
import {
  getPaymentProofImage,
  listPendingPaymentProofs,
  reviewPaymentProof,
  submitStudentPaymentProof,
  getMessPaymentSettings,
  getMessPaymentQrImage,
  saveMessPaymentSettings,
} from "../src/lib/payment-proof-service";
import { Expense } from "../src/models/Expense";
import { Payment } from "../src/models/Payment";
import { PaymentProof } from "../src/models/PaymentProof";
import { Student } from "../src/models/Student";
import { Subscription } from "../src/models/Subscription";
import { MessSettings } from "../src/models/MessSettings";
import { currentIndiaDateKey, parseServiceDate } from "../src/lib/meal-service";

const testDatabasePrefix = "mess_management_finance_test_";
let testDatabaseName = "";
let testDatabaseWasVerifiedNew = false;
let originalMongoUri: string | undefined;
let studentSequence = 0;
let originalQrStorageDir: string | undefined;
let testQrStorageDir = "";

before(async () => {
  const configuredUri = process.env.MONGODB_URI;
  assert.ok(configuredUri, "MONGODB_URI must be set to run finance integration tests");

  testDatabaseName = `${testDatabasePrefix}${randomUUID().replaceAll("-", "")}`;
  const testUri = new URL(configuredUri);
  testUri.pathname = `/${testDatabaseName}`;
  const inspectionConnection = await mongoose
    .createConnection(configuredUri, { serverSelectionTimeoutMS: 5000 })
    .asPromise();

  let databaseWasAbsent: boolean;
  try {
    const database = inspectionConnection.db;
    assert.ok(database, "MongoDB inspection connection has no database");
    const listedDatabases = await database.admin().listDatabases({ nameOnly: true });
    databaseWasAbsent = !listedDatabases.databases.some(
      ({ name }) => name === testDatabaseName,
    );
  } finally {
    await inspectionConnection.close();
  }
  assert.equal(databaseWasAbsent, true, "Refusing to use an existing finance test database");
  testDatabaseWasVerifiedNew = true;

  originalMongoUri = configuredUri;
  originalQrStorageDir = process.env.PAYMENT_QR_STORAGE_DIR;
  testQrStorageDir = await mkdtemp(path.join(os.tmpdir(), "mess-payment-qr-test-"));
  process.env.PAYMENT_QR_STORAGE_DIR = testQrStorageDir;
  process.env.MONGODB_URI = testUri.toString();
  await connectDB();
  await Promise.all([
    Student.syncIndexes(),
    Subscription.syncIndexes(),
    Payment.syncIndexes(),
    PaymentProof.syncIndexes(),
    Expense.syncIndexes(),
    MessSettings.syncIndexes(),
  ]);
});

after(async () => {
  try {
    if (
      testDatabaseWasVerifiedNew &&
      testDatabaseName.startsWith(testDatabasePrefix) &&
      mongoose.connection.readyState === 1
    ) {
      await mongoose.connection.dropDatabase();
    }
  } finally {
    await mongoose.disconnect();
    if (originalMongoUri === undefined) {
      delete process.env.MONGODB_URI;
    } else {
      process.env.MONGODB_URI = originalMongoUri;
    }
    if (originalQrStorageDir === undefined) delete process.env.PAYMENT_QR_STORAGE_DIR;
    else process.env.PAYMENT_QR_STORAGE_DIR = originalQrStorageDir;
    if (testQrStorageDir) await rm(testQrStorageDir, { recursive: true, force: true });
  }
});

async function createStudentRecord() {
  studentSequence += 1;
  return Student.create({
    studentId: `FIN-${studentSequence}`,
    fullName: `Finance Test ${studentSequence}`,
    passwordHash: `$2b$12$${"D".repeat(53)}`,
    role: "student",
    status: "active",
  });
}

async function createAdmin() {
  return Student.create({
    studentId: `FIN-ADMIN-${randomUUID().slice(0, 8)}`,
    fullName: "Finance Test Admin",
    passwordHash: `$2b$12$${"E".repeat(53)}`,
    role: "admin",
    status: "active",
  });
}

test("full calendar-month billing includes any touched month at full price", () => {
  assert.equal(
    fullCalendarMonthsBilled(
      new Date("2026-02-15T00:00:00.000Z"),
      new Date("2026-03-01T00:00:00.000Z"),
    ),
    1,
  );
  assert.equal(
    fullCalendarMonthsBilled(
      new Date("2026-02-15T00:00:00.000Z"),
      new Date("2026-03-15T00:00:00.000Z"),
    ),
    2,
  );
  assert.equal(
    subscriptionChargePaise({
      startDate: new Date("2026-02-15T00:00:00.000Z"),
      endDate: new Date("2026-03-15T00:00:00.000Z"),
      monthlyAmountPaise: 150000,
    }),
    300000,
  );
});

test("partial payments are idempotent, serialized, and cannot exceed the charge", async () => {
  const student = await createStudentRecord();
  const admin = await createAdmin();
  const startDate = new Date("2026-10-01T00:00:00.000Z");
  const endDate = new Date("2026-12-01T00:00:00.000Z");
  const subscription = await Subscription.createForStudent({
    student: student._id,
    plan: "afternoon",
    startDate,
    endDate,
  });

  const idempotencyKey = `payment-${randomUUID()}`;
  const firstPayment = await recordPayment({
    subscriptionId: subscription._id.toString(),
    amountPaise: 150000,
    method: "upi",
    idempotencyKey,
    operatorId: admin.id,
  });
  const retry = await recordPayment({
    subscriptionId: subscription.id,
    amountPaise: 150000,
    method: "upi",
    idempotencyKey,
    operatorId: admin.id,
  });

  assert.equal(firstPayment.receiptRef, retry.receiptRef);
  assert.equal(await Payment.countDocuments({ subscription: subscription._id }), 1);
  assert.match(firstPayment.receiptRef, /^MM-R-/);

  await assert.rejects(
    recordPayment({
      subscriptionId: subscription.id,
      amountPaise: 100000,
      method: "cash",
      idempotencyKey,
      operatorId: admin.id,
    }),
    (error: unknown) => error instanceof ApiError && error.code === "IDEMPOTENCY_KEY_REUSED",
  );

  const concurrentPayments = await Promise.allSettled([
    recordPayment({
      subscriptionId: subscription.id,
      amountPaise: 150000,
      method: "cash",
      idempotencyKey: `payment-${randomUUID()}`,
      operatorId: admin.id,
    }),
    recordPayment({
      subscriptionId: subscription.id,
      amountPaise: 150000,
      method: "cash",
      idempotencyKey: `payment-${randomUUID()}`,
      operatorId: admin.id,
    }),
  ]);

  assert.equal(concurrentPayments.filter((result) => result.status === "fulfilled").length, 1);
  const ledger = await getSubscriptionLedger(subscription.id);
  assert.equal(ledger.totalChargePaise, 300000);
  assert.equal(ledger.receivedPaise, 300000);
  assert.equal(ledger.outstandingPaise, 0);
});

test("reversal preserves the payment and restores its balance", async () => {
  const student = await createStudentRecord();
  const admin = await createAdmin();
  const date = new Date("2026-10-01T00:00:00.000Z");
  const subscription = await Subscription.createForStudent({
    student: student._id,
    plan: "night",
    startDate: date,
    endDate: new Date("2026-11-01T00:00:00.000Z"),
  });
  const payment = await recordPayment({
    subscriptionId: subscription.id,
    amountPaise: 50000,
    method: "cash",
    idempotencyKey: `payment-${randomUUID()}`,
    operatorId: admin.id,
  });

  await reversePayment(payment._id.toString(), admin.id, "Cash entry was recorded in error");
  const ledger = await getSubscriptionLedger(subscription._id.toString());
  const storedPayment = await Payment.findById(payment._id);

  assert.equal(storedPayment?.status, "reversed");
  assert.equal(ledger.payments.length, 1);
  assert.equal(ledger.receivedPaise, 0);
  assert.equal(ledger.outstandingPaise, 150000);
});

test("student payment proofs are private until admin review and only paid proofs add income", async () => {
  const student = await createStudentRecord();
  const otherStudent = await createStudentRecord();
  const admin = await createAdmin();
  const today = new Date(`${currentIndiaDateKey()}T00:00:00.000Z`);
  const endDate = new Date(today.getTime() + 35 * 86_400_000);
  const subscription = await Subscription.createForStudent({
    student: student._id,
    plan: "afternoon",
    startDate: today,
    endDate,
  });

  await assert.rejects(
    submitStudentPaymentProof({
      studentId: otherStudent.id,
      subscriptionId: subscription.id,
      amountPaise: 50000,
      utr: "UTRTEST0001",
      method: "upi",
      screenshot: Buffer.from("proof-image"),
      contentType: "image/png",
    }),
    (error: unknown) => error instanceof ApiError && error.code === "SUBSCRIPTION_NOT_FOUND",
  );

  const proof = await submitStudentPaymentProof({
    studentId: student.id,
    subscriptionId: subscription.id,
    amountPaise: 50000,
    utr: "UTRTEST0002",
    method: "upi",
    screenshot: Buffer.from("proof-image"),
    contentType: "image/png",
  });
  assert.equal(proof.status, "pending");
  assert.equal((await listPendingPaymentProofs()).length, 1);
  assert.deepEqual((await getPaymentProofImage(proof.id)).screenshot, Buffer.from("proof-image"));

  const paidProof = await reviewPaymentProof({
    proofId: proof.id,
    decision: "paid",
    operatorId: admin.id,
  });
  assert.equal(paidProof?.status, "approved");
  assert.equal((await getSubscriptionLedger(subscription.id)).receivedPaise, 50000);
  await reviewPaymentProof({ proofId: proof.id, decision: "paid", operatorId: admin.id });
  assert.equal(await Payment.countDocuments({ subscription: subscription._id }), 1);

  const rejectedSubscription = await Subscription.createForStudent({
    student: otherStudent._id,
    plan: "night",
    startDate: today,
    endDate,
  });
  const rejectedProof = await submitStudentPaymentProof({
    studentId: otherStudent.id,
    subscriptionId: rejectedSubscription.id,
    amountPaise: 50000,
    utr: "UTRTEST0003",
    method: "bank_transfer",
    screenshot: Buffer.from("other-proof"),
    contentType: "image/jpeg",
  });
  const notPaidProof = await reviewPaymentProof({
    proofId: rejectedProof.id,
    decision: "not_paid",
    operatorId: admin.id,
    reviewNote: "Transfer not found",
  });
  assert.equal(notPaidProof?.status, "rejected");
  assert.equal((await getSubscriptionLedger(rejectedSubscription.id)).receivedPaise, 0);
});

test("central payment settings persist their UPI ID and keep QR files outside MongoDB", async () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
  const saved = await saveMessPaymentSettings({ upiId: "mess.owner@bank", qrImage: { bytes: png, contentType: "image/png" } });
  assert.equal(saved.upiId, "mess.owner@bank");
  assert.equal(saved.qrUrl, "/api/payment-settings/qr");
  const settings = await MessSettings.findOne({ key: "primary" }).lean();
  assert.ok(settings?.upiQrStorageKey);
  assert.equal("upiQrImage" in (settings ?? {}), false);
  assert.deepEqual(await readFile(path.join(testQrStorageDir, settings.upiQrStorageKey!)), png);
  assert.deepEqual((await getMessPaymentQrImage()).bytes, png);
  assert.equal((await getMessPaymentSettings()).upiId, "mess.owner@bank");

  const replaced = await saveMessPaymentSettings({ upiId: "new.owner@bank", qrImage: { bytes: Buffer.concat([png, Buffer.from([5])]), contentType: "image/png" } });
  assert.equal(replaced.upiId, "new.owner@bank");
  assert.notEqual((await MessSettings.findOne({ key: "primary" }).lean())?.upiQrStorageKey, settings.upiQrStorageKey);
  const removed = await saveMessPaymentSettings({ upiId: "", removeQr: true });
  assert.deepEqual(removed, { upiId: "", qrUrl: "" });
  assert.equal((await MessSettings.findOne({ key: "primary" }).lean())?.upiQrStorageKey, undefined);
});

test("financial report payment dates follow Asia/Kolkata midnight", async () => {
  const student = await createStudentRecord();
  const admin = await createAdmin();
  const dateKey = currentIndiaDateKey();
  const date = parseServiceDate(dateKey).date;
  const subscription = await Subscription.createForStudent({
    student: student._id,
    plan: "afternoon",
    startDate: date,
    endDate: new Date(date.getTime() + 86_400_000),
  });
  const indiaDayStart = new Date(date.getTime() - 330 * 60_000);

  await Promise.all([
    Payment.create({
      subscription: subscription._id,
      student: student._id,
      amountPaise: 50000,
      method: "upi",
      receiptRef: `MM-R-LOCAL-${randomUUID()}`,
      idempotencyKey: `local-period-${randomUUID()}`,
      receivedAt: new Date(indiaDayStart.getTime() + 60_000),
      recordedBy: admin._id,
      status: "received",
    }),
    Payment.create({
      subscription: subscription._id,
      student: student._id,
      amountPaise: 70000,
      method: "cash",
      receiptRef: `MM-R-PRIOR-${randomUUID()}`,
      idempotencyKey: `prior-period-${randomUUID()}`,
      receivedAt: new Date(indiaDayStart.getTime() - 1),
      recordedBy: admin._id,
      status: "received",
    }),
  ]);

  const report = await getFinancialReport(dateKey, dateKey);
  assert.equal(report.collectedPaise, 50000);
  assert.equal(report.paymentsByMethod.upi, 50000);
  assert.equal(report.paymentsByMethod.cash, undefined);
});

test("expenses are idempotent and financial reports separate accrued and cash totals", async () => {
  const student = await createStudentRecord();
  const admin = await createAdmin();
  const today = new Date(`${currentIndiaDateKey()}T00:00:00.000Z`);
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const subscription = await Subscription.createForStudent({
    student: student._id,
    plan: "both",
    startDate: today,
    endDate: tomorrow,
  });
  const payment = await recordPayment({
    subscriptionId: subscription._id.toString(),
    amountPaise: 100000,
    method: "bank_transfer",
    idempotencyKey: `payment-${randomUUID()}`,
    operatorId: admin.id,
  });
  const expenseKey = `expense-${randomUUID()}`;
  const expense = await recordExpense({
    category: "food_supplies",
    amountPaise: 25000,
    expenseDate: currentIndiaDateKey(),
    description: "Fresh produce purchase",
    paymentMethod: "upi",
    reference: "UPI-TXN-001",
    idempotencyKey: expenseKey,
    operatorId: admin.id,
  });
  const expenseRetry = await recordExpense({
    category: "food_supplies",
    amountPaise: 25000,
    expenseDate: currentIndiaDateKey(),
    description: "Fresh produce purchase",
    paymentMethod: "upi",
    reference: "UPI-TXN-001",
    idempotencyKey: expenseKey,
    operatorId: admin.id,
  });

  assert.equal(expense._id.toString(), expenseRetry._id.toString());
  assert.equal(expense.paymentMethod, "upi");
  assert.equal(expense.reference, "UPI-TXN-001");
  await assert.rejects(
    recordExpense({
      category: "food_supplies",
      amountPaise: 25001,
      expenseDate: currentIndiaDateKey(),
      description: "Fresh produce purchase",
      idempotencyKey: expenseKey,
      operatorId: admin.id,
    }),
    (error: unknown) => error instanceof ApiError && error.code === "IDEMPOTENCY_KEY_REUSED",
  );
  await assert.rejects(
    recordExpense({
      category: "food_supplies",
      amountPaise: 25000,
      expenseDate: currentIndiaDateKey(),
      description: "Fresh produce purchase",
      paymentMethod: "cash",
      reference: "UPI-TXN-001",
      idempotencyKey: expenseKey,
      operatorId: admin.id,
    }),
    (error: unknown) => error instanceof ApiError && error.code === "IDEMPOTENCY_KEY_REUSED",
  );

  const report = await getFinancialReport(currentIndiaDateKey(), currentIndiaDateKey());
  assert.equal(report.accruedChargesPaise, 300000);
  assert.equal(report.collectedPaise, 100000);
  assert.equal(report.expensesPaise, 25000);
  assert.equal(report.netCashMovementPaise, 75000);
  assert.equal(report.outstandingPaise, 200000);
  assert.equal(report.paymentsByMethod.bank_transfer, 100000);
  assert.equal(report.expensesByCategory.food_supplies, 25000);
  assert.equal(report.netCashMovementLabel, "Collections minus recorded expenses; not accounting profit");

  await reverseExpense(expense._id.toString(), admin.id, "Receipt belongs to another date");
  const reversed = await Expense.findById(expense._id);
  assert.equal(reversed?.status, "reversed");
  assert.ok(await Payment.findById(payment._id));
  assert.equal(await Expense.countDocuments({ _id: expense._id }), 1);
  assert.equal(parseServiceDate(currentIndiaDateKey()).date.toISOString().slice(0, 10), currentIndiaDateKey());
});

beforeEach(async () => {
  await Promise.all([
    Payment.deleteMany({}),
    PaymentProof.deleteMany({}),
    Expense.deleteMany({}),
    Subscription.deleteMany({}),
    Student.deleteMany({}),
  ]);
});

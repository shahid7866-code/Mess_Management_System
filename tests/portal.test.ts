import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/mongodb";
import { getStudentPortalData, createStudentSubscription } from "../src/lib/portal-service";
import { ApiError } from "../src/lib/api-response";
import { currentIndiaDateKey, parseServiceDate } from "../src/lib/meal-service";
import { Attendance } from "../src/models/Attendance";
import { DailyMenu } from "../src/models/DailyMenu";
import { Payment } from "../src/models/Payment";
import { Session } from "../src/models/Session";
import { Student } from "../src/models/Student";
import { Subscription } from "../src/models/Subscription";

const testDatabasePrefix = "mess_management_portal_test_";
let testDatabaseName = "";
let testDatabaseWasVerifiedNew = false;
let originalMongoUri: string | undefined;

before(async () => {
  const configuredUri = process.env.MONGODB_URI;
  assert.ok(configuredUri, "MONGODB_URI must be set to run portal integration tests");

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
  assert.equal(databaseWasAbsent, true, "Refusing to use an existing portal test database");
  testDatabaseWasVerifiedNew = true;

  originalMongoUri = configuredUri;
  process.env.MONGODB_URI = testUri.toString();
  await connectDB();
  await Promise.all([
    Student.syncIndexes(),
    Subscription.syncIndexes(),
    Payment.syncIndexes(),
    Attendance.syncIndexes(),
    DailyMenu.syncIndexes(),
    Session.syncIndexes(),
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
  }
});

test("portal projection contains only the authenticated student's private records", async () => {
  const ownStudent = await Student.create({
    studentId: "PORTAL-OWN",
    fullName: "Portal Student",
    email: "portal-own@example.test",
    passwordHash: `$2b$12$${"F".repeat(53)}`,
    role: "student",
    status: "active",
  });
  const otherStudent = await Student.create({
    studentId: "PORTAL-OTHER",
    fullName: "Other Student",
    email: "portal-other@example.test",
    passwordHash: `$2b$12$${"G".repeat(53)}`,
    role: "student",
    status: "active",
  });
  const dateKey = currentIndiaDateKey();
  const { date } = parseServiceDate(dateKey);
  const tomorrow = new Date(date.getTime() + 86_400_000);
  const ownSubscription = await Subscription.createForStudent({
    student: ownStudent._id,
    plan: "afternoon",
    startDate: date,
    endDate: tomorrow,
  });
  const otherSubscription = await Subscription.createForStudent({
    student: otherStudent._id,
    plan: "night",
    startDate: date,
    endDate: tomorrow,
  });
  const operator = await Student.create({
    studentId: "PORTAL-ADMIN",
    fullName: "Portal Test Operator",
    passwordHash: `$2b$12$${"H".repeat(53)}`,
    role: "admin",
    status: "active",
  });
  await Promise.all([
    Payment.create({
      subscription: ownSubscription._id,
      student: ownStudent._id,
      amountPaise: 25000,
      method: "cash",
      receiptRef: "PORTAL-OWN-RECEIPT",
      idempotencyKey: "portal-own-payment-key",
      receivedAt: new Date(),
      recordedBy: operator._id,
      status: "received",
    }),
    Payment.create({
      subscription: otherSubscription._id,
      student: otherStudent._id,
      amountPaise: 50000,
      method: "upi",
      receiptRef: "PORTAL-OTHER-RECEIPT",
      idempotencyKey: "portal-other-payment-key",
      receivedAt: new Date(),
      recordedBy: operator._id,
      status: "received",
    }),
    Attendance.create({
      student: ownStudent._id,
      serviceDate: date,
      meal: "afternoon",
      status: "present",
      markedAt: new Date(),
      markedBy: operator._id,
    }),
    Attendance.create({
      student: otherStudent._id,
      serviceDate: date,
      meal: "night",
      status: "absent",
      markedAt: new Date(),
      markedBy: operator._id,
    }),
    DailyMenu.create({
      serviceDate: date,
      afternoonItems: ["Roti", "Dal"],
      nightItems: ["Rice", "Vegetables"],
      updatedBy: operator._id,
    }),
  ]);

  const portal = await getStudentPortalData(ownStudent._id.toString());
  const serialized = JSON.stringify(portal);

  assert.equal(portal.profile.studentId, "PORTAL-OWN");
  assert.equal(portal.eligibility.afternoon, true);
  assert.equal(portal.eligibility.night, false);
  assert.equal(portal.payments.length, 1);
  assert.equal(portal.payments[0].receiptRef, "PORTAL-OWN-RECEIPT");
  assert.equal(portal.attendance.length, 1);
  assert.equal(portal.attendance[0].status, "present");
  assert.equal(serialized.includes("PORTAL-OTHER"), false);
  assert.equal(serialized.includes("PORTAL-OTHER-RECEIPT"), false);
  assert.equal(serialized.includes("passwordHash"), false);
  assert.equal(serialized.includes("subscriptionLockToken"), false);
});

test("student enrollment calculates plan price server-side and prevents overlapping terms", async () => {
  const student = await Student.create({
    studentId: "PORTAL-ENROLL",
    fullName: "Enrollment Student",
    passwordHash: `$2b$12$${"J".repeat(53)}`,
    role: "student",
    status: "active",
  });
  const startDate = currentIndiaDateKey();
  const subscription = await createStudentSubscription({
    studentId: student.id,
    plan: "both",
    months: 2,
    startDate,
  });

  assert.equal(subscription.monthlyAmountPaise, 300000);
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const expectedEndDate = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 2, 1));
  assert.equal(subscription.endDate.toISOString().slice(0, 10), expectedEndDate.toISOString().slice(0, 10));
  await assert.rejects(
    createStudentSubscription({ studentId: student.id, plan: "afternoon", months: 1, startDate }),
    (error: unknown) => error instanceof ApiError && error.code === "SUBSCRIPTION_PERIOD_OVERLAP",
  );
  const pastDate = new Date(`${startDate}T00:00:00.000Z`);
  pastDate.setUTCDate(pastDate.getUTCDate() - 1);
  await assert.rejects(
    createStudentSubscription({
      studentId: student.id,
      plan: "night",
      months: 1,
      startDate: pastDate.toISOString().slice(0, 10),
    }),
    (error: unknown) => error instanceof ApiError && error.code === "PAST_SUBSCRIPTION_START",
  );
});
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import mongoose from "mongoose";
import {
  Student,
  type StudentFields,
} from "../src/models/Student";
import {
  OverlappingSubscriptionError,
  SUBSCRIPTION_PRICES_PAISE,
  Subscription,
  type CreateSubscriptionInput,
  type SubscriptionPlan,
} from "../src/models/Subscription";

const testDatabasePrefix = "mess_management_model_test_";
const passwordHash = `$2b$12$${"A".repeat(53)}`;

let testDatabaseName = "";
let testDatabaseWasVerifiedNew = false;
let studentSequence = 0;

function newStudentInput(overrides: Partial<StudentFields> = {}): StudentFields {
  studentSequence += 1;
  return {
    studentId: `TEST-${studentSequence}`,
    fullName: "Test Student",
    passwordHash,
    role: "student",
    status: "active",
    ...overrides,
  };
}

function newSubscriptionInput(
  student: mongoose.Types.ObjectId,
  overrides: Partial<CreateSubscriptionInput> = {},
): CreateSubscriptionInput {
  return {
    student,
    plan: "afternoon",
    startDate: new Date("2026-01-01T00:00:00.000Z"),
    endDate: new Date("2026-02-01T00:00:00.000Z"),
    ...overrides,
  };
}

function isValidationError(error: unknown): boolean {
  return error instanceof mongoose.Error.ValidationError;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

before(async () => {
  const configuredUri = process.env.MONGODB_URI;
  assert.ok(configuredUri, "MONGODB_URI must be set to run model integration tests");

  testDatabaseName = `${testDatabasePrefix}${randomUUID().replaceAll("-", "")}`;
  const testUri = new URL(configuredUri);
  testUri.pathname = `/${testDatabaseName}`;

  await mongoose.connect(testUri.toString(), {
    bufferCommands: false,
    serverSelectionTimeoutMS: 5000,
  });

  const database = mongoose.connection.db;
  assert.ok(database, "MongoDB connection did not select a database");
  const listedDatabases = await database.admin().listDatabases({ nameOnly: true });
  assert.equal(
    listedDatabases.databases.some(({ name }) => name === testDatabaseName),
    false,
    "Refusing to use a test database that already exists",
  );
  testDatabaseWasVerifiedNew = true;

  await Student.syncIndexes();
  await Subscription.syncIndexes();
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
  }
});

test("Student validates required fields, normalizes contacts, and hides hashes", async () => {
  const student = await Student.create(
    newStudentInput({
      studentId: " s-100 ",
      fullName: "  Asha Student  ",
      email: "  ASHA@example.com ",
      phone: "+91 (98765) 43210",
    }),
  );

  assert.equal(student.studentId, "S-100");
  assert.equal(student.fullName, "Asha Student");
  assert.equal(student.email, "asha@example.com");
  assert.equal(student.phone, "+919876543210");
  assert.equal(student.toJSON().passwordHash, undefined);
  assert.equal((await Student.findById(student._id))?.passwordHash, undefined);

  const missingFields = new Student({});
  await assert.rejects(missingFields.validate(), isValidationError);

  const plaintextPassword = new Student(
    newStudentInput({ passwordHash: "not-a-password-hash" }),
  );
  await assert.rejects(plaintextPassword.validate(), isValidationError);

  const invalidPhone = new Student(newStudentInput({ phone: "12" }));
  await assert.rejects(invalidPhone.validate(), isValidationError);
});

test("Student unique indexes reject duplicate IDs and supplied emails", async () => {
  const studentIndexes = await Student.collection.indexes();
  const studentIdIndex = studentIndexes.find(
    (index) => index.key.studentId === 1,
  );
  const emailIndex = studentIndexes.find((index) => index.key.email === 1);

  assert.equal(studentIdIndex?.unique, true);
  assert.equal(emailIndex?.unique, true);
  assert.deepEqual(emailIndex?.partialFilterExpression, {
    email: { $type: "string" },
  });

  await Student.create(newStudentInput({ studentId: "DUP-1" }));
  await assert.rejects(
    Student.create(newStudentInput({ studentId: " dup-1 " })),
    isDuplicateKeyError,
  );

  await Student.create(
    newStudentInput({ email: "duplicate@example.com" }),
  );
  await assert.rejects(
    Student.create(newStudentInput({ email: " DUPLICATE@example.com " })),
    isDuplicateKeyError,
  );

  const noEmailStudents = await Student.create([
    newStudentInput({ email: undefined }),
    newStudentInput({ email: "   " }),
  ]);
  assert.equal(noEmailStudents.length, 2);
  assert.equal(noEmailStudents[0].email, undefined);
  assert.equal(noEmailStudents[1].email, undefined);
});

test("Subscription validates plans, dates, required fields, and paise prices", async () => {
  const student = await Student.create(newStudentInput());
  const validSubscription = new Subscription({
    ...newSubscriptionInput(student._id),
    monthlyAmountPaise: SUBSCRIPTION_PRICES_PAISE.afternoon,
  });
  await validSubscription.validate();

  await assert.rejects(new Subscription({}).validate(), isValidationError);

  const invalidPlan = new Subscription({
    ...newSubscriptionInput(student._id),
    plan: "breakfast" as SubscriptionPlan,
    monthlyAmountPaise: 150000,
  });
  await assert.rejects(invalidPlan.validate(), isValidationError);

  const invalidRange = new Subscription({
    ...newSubscriptionInput(student._id, {
      endDate: new Date("2025-12-31T00:00:00.000Z"),
    }),
    monthlyAmountPaise: 150000,
  });
  await assert.rejects(invalidRange.validate(), isValidationError);

  const invalidDate = new Subscription({
    ...newSubscriptionInput(student._id, {
      endDate: "not-a-date" as unknown as Date,
    }),
    monthlyAmountPaise: 150000,
  });
  await assert.rejects(invalidDate.validate(), isValidationError);

  const incorrectPrice = new Subscription({
    ...newSubscriptionInput(student._id),
    monthlyAmountPaise: 150001,
  });
  await assert.rejects(incorrectPrice.validate(), isValidationError);

  const fractionalPaise = new Subscription({
    ...newSubscriptionInput(student._id),
    monthlyAmountPaise: 150000.5,
  });
  await assert.rejects(fractionalPaise.validate(), isValidationError);
});

test("Subscription derives price and permits adjacent non-overlapping periods", async () => {
  const student = await Student.create(newStudentInput());
  const first = await Subscription.createForStudent(
    newSubscriptionInput(student._id),
  );
  const next = await Subscription.createForStudent(
    newSubscriptionInput(student._id, {
      plan: "both",
      startDate: new Date("2026-02-01T00:00:00.000Z"),
      endDate: new Date("2026-03-01T00:00:00.000Z"),
    }),
  );

  assert.equal(first.monthlyAmountPaise, 150000);
  assert.equal(next.monthlyAmountPaise, 300000);

  await assert.rejects(
    Subscription.createForStudent(
      newSubscriptionInput(student._id, {
        monthlyAmountPaise: 300000,
      }),
    ),
    /must match the selected plan/,
  );

  await assert.rejects(
    Subscription.createForStudent(
      newSubscriptionInput(student._id, {
        startDate: new Date("2026-01-31T00:00:00.000Z"),
        endDate: new Date("2026-02-15T00:00:00.000Z"),
      }),
    ),
    OverlappingSubscriptionError,
  );
});

test("Subscription serializes concurrent overlapping creates for one student", async () => {
  const student = await Student.create(newStudentInput());
  const startDate = new Date("2026-04-01T00:00:00.000Z");
  const endDate = new Date("2026-05-01T00:00:00.000Z");
  const results = await Promise.allSettled([
    Subscription.createForStudent(
      newSubscriptionInput(student._id, { startDate, endDate }),
    ),
    Subscription.createForStudent(
      newSubscriptionInput(student._id, { startDate, endDate }),
    ),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected");
  assert.ok(rejected && rejected.status === "rejected");
  assert.ok(rejected.reason instanceof OverlappingSubscriptionError);
});

test("Subscription indexes support student, status, plan, and date queries", async () => {
  const subscriptionIndexes = await Subscription.collection.indexes();
  assert.ok(
    subscriptionIndexes.some(
      (index) =>
        index.key.student === 1 &&
        index.key.status === 1 &&
        index.key.startDate === 1 &&
        index.key.endDate === 1,
    ),
  );
  assert.ok(
    subscriptionIndexes.some(
      (index) =>
        index.key.status === 1 &&
        index.key.plan === 1 &&
        index.key.startDate === 1 &&
        index.key.endDate === 1,
    ),
  );
});
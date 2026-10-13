import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { ApiError } from "../src/lib/api-response";
import { authenticateStudent } from "../src/lib/auth-service";
import { createSession } from "../src/lib/auth";
import { connectDB } from "../src/lib/mongodb";
import { Session } from "../src/models/Session";
import { Student } from "../src/models/Student";
import { POST as loginPost } from "../src/app/api/auth/login/route";

const testDatabasePrefix = "mess_management_auth_test_";
const testPassword = "Test-Only-Password-238!";

let testDatabaseName = "";
let testDatabaseWasVerifiedNew = false;
let studentSequence = 0;
let originalMongoUri: string | undefined;

before(async () => {
  const configuredUri = process.env.MONGODB_URI;
  assert.ok(configuredUri, "MONGODB_URI must be set to run auth integration tests");

  testDatabaseName = `${testDatabasePrefix}${randomUUID().replaceAll("-", "")}`;
  const testUri = new URL(configuredUri);
  testUri.pathname = `/${testDatabaseName}`;

  const inspectionConnection = await mongoose
    .createConnection(configuredUri, {
      serverSelectionTimeoutMS: 5000,
    })
    .asPromise();
  let databaseWasAbsent: boolean;
  try {
    const inspectionDatabase = inspectionConnection.db;
    assert.ok(inspectionDatabase, "MongoDB inspection connection has no database");
    const listedDatabases = await inspectionDatabase
      .admin()
      .listDatabases({ nameOnly: true });
    databaseWasAbsent = !listedDatabases.databases.some(
      ({ name }) => name === testDatabaseName,
    );
  } finally {
    await inspectionConnection.close();
  }
  assert.equal(
    databaseWasAbsent,
    true,
    "Refusing to use an auth test database that already exists",
  );
  testDatabaseWasVerifiedNew = true;

  originalMongoUri = configuredUri;
  process.env.MONGODB_URI = testUri.toString();
  await connectDB();

  const database = mongoose.connection.db;
  assert.ok(database, "MongoDB connection did not select a database");
  await Student.syncIndexes();
  await Session.syncIndexes();
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

async function createStudent(status: "active" | "inactive" = "active") {
  studentSequence += 1;
  return Student.create({
    studentId: `AUTH-${studentSequence}`,
    fullName: "Auth Test Student",
    email: `auth-${studentSequence}@example.test`,
    passwordHash: await bcrypt.hash(testPassword, 4),
    role: "student",
    status,
  });
}

test("authenticates by normalized student ID or email without returning hashes", async () => {
  const student = await createStudent();

  const byStudentId = await authenticateStudent(` ${student.studentId.toLowerCase()} `, testPassword);
  const byEmail = await authenticateStudent(student.email!, testPassword);

  assert.equal(byStudentId.id, student.id);
  assert.equal(byEmail.id, student.id);
  assert.equal(byEmail.role, "student");
  assert.equal("passwordHash" in byEmail, false);
});

test("rejects invalid credentials and inactive accounts with the same response", async () => {
  const activeStudent = await createStudent();
  const inactiveStudent = await createStudent("inactive");

  await assert.rejects(
    authenticateStudent(activeStudent.studentId, "wrong-password"),
    (error: unknown) => error instanceof ApiError && error.status === 401,
  );
  await assert.rejects(
    authenticateStudent(inactiveStudent.studentId, testPassword),
    (error: unknown) => error instanceof ApiError && error.status === 401,
  );
});

test("limits repeated failed login attempts by normalized identifier", async () => {
  const identifier = `missing-${randomUUID()}@example.test`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await assert.rejects(
      authenticateStudent(identifier, "wrong-password"),
      (error: unknown) => error instanceof ApiError && error.status === 401,
    );
  }

  await assert.rejects(
    authenticateStudent(identifier, "wrong-password"),
    (error: unknown) => error instanceof ApiError && error.status === 429,
  );
});

test("stores only a digest of the session cookie token and has expiry indexes", async () => {
  const student = await createStudent();
  const token = await createSession(student.id);
  const tokenHash = createHash("sha256").update(token).digest("hex");

  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(await Session.collection.findOne({ tokenHash: token }), null);
  assert.ok(await Session.collection.findOne({ tokenHash }));

  const indexes = await Session.collection.indexes();
  assert.ok(indexes.some((index) => index.key.tokenHash === 1 && index.unique));
  assert.ok(
    indexes.some(
      (index) => index.key.expiresAt === 1 && index.expireAfterSeconds === 0,
    ),
  );
});

test("login route returns a safe user and sets an HttpOnly session cookie", async () => {
  const student = await createStudent();
  const previousToken = await createSession(student.id);
  const previousTokenHash = createHash("sha256").update(previousToken).digest("hex");
  const response = await loginPost(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `messmate_session=${previousToken}`,
      },
      body: JSON.stringify({
        identifier: student.studentId,
        password: testPassword,
      }),
    }),
  );
  const body = (await response.json()) as {
    ok: boolean;
    data: { student: Record<string, unknown> };
  };
  const setCookie = response.headers.get("set-cookie") ?? "";

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal("passwordHash" in body.data.student, false);
  assert.equal(setCookie.includes("HttpOnly"), true);
  assert.equal(setCookie.includes("SameSite=Lax"), true);
  assert.equal(setCookie.includes("Secure"), false);
  assert.equal(setCookie.includes("messmate_session="), true);
  assert.equal(await Session.collection.findOne({ tokenHash: previousTokenHash }), null);
});

test("login route does not reveal whether an identifier exists", async () => {
  const response = await loginPost(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: `missing-${randomUUID()}@example.test`,
        password: "incorrect-password",
      }),
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.deepEqual(body, {
    ok: false,
    error: {
      code: "INVALID_CREDENTIALS",
      message: "Invalid identifier or password",
    },
  });
});

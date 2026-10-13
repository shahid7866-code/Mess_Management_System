import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import {
  createStudentAccount,
  listStudents,
  updateStudentAccount,
} from "../src/lib/student-service";
import { connectDB } from "../src/lib/mongodb";
import { Student } from "../src/models/Student";

const testDatabasePrefix = "mess_management_students_test_";
let testDatabaseName = "";
let testDatabaseWasVerifiedNew = false;
let originalMongoUri: string | undefined;
let studentSequence = 0;

before(async () => {
  const configuredUri = process.env.MONGODB_URI;
  assert.ok(configuredUri, "MONGODB_URI must be set to run student integration tests");

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
  assert.equal(databaseWasAbsent, true, "Refusing to use an existing student test database");
  testDatabaseWasVerifiedNew = true;

  originalMongoUri = configuredUri;
  process.env.MONGODB_URI = testUri.toString();
  await connectDB();
  await Student.syncIndexes();
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

function uniqueStudentId(): string {
  studentSequence += 1;
  return `SERVICE-${studentSequence}`;
}

test("creates students with server-owned role, status, and hashed password", async () => {
  const student = await createStudentAccount({
    studentId: uniqueStudentId(),
    fullName: "  Service Student  ",
    email: "  SERVICE@example.test ",
    password: "test-service-password-876",
  });

  assert.equal(student.fullName, "Service Student");
  assert.equal(student.email, "service@example.test");
  assert.equal(student.role, "student");
  assert.equal(student.status, "active");
  assert.equal("passwordHash" in student, false);

  const storedStudent = await Student.findById(student._id).select("+passwordHash");
  assert.ok(storedStudent?.passwordHash);
  assert.equal(
    await bcrypt.compare("test-service-password-876", storedStudent.passwordHash),
    true,
  );
});

test("searches safely and paginates students", async () => {
  const searchName = `Search-${randomUUID().slice(0, 8)}`;
  await createStudentAccount({
    studentId: uniqueStudentId(),
    fullName: searchName,
    password: "search-student-password-876",
  });
  await createStudentAccount({
    studentId: uniqueStudentId(),
    fullName: `${searchName} Second`,
    password: "search-student-password-876",
  });

  const firstPage = await listStudents({ search: searchName, page: 1, limit: 1 });
  const secondPage = await listStudents({ search: searchName, page: 2, limit: 1 });
  const escapedPattern = await listStudents({ search: ".*", page: 1, limit: 20 });

  assert.equal(firstPage.pagination.total, 2);
  assert.equal(firstPage.pagination.totalPages, 2);
  assert.equal(firstPage.students.length, 1);
  assert.equal(secondPage.students.length, 1);
  assert.notEqual(firstPage.students[0]._id.toString(), secondPage.students[0]._id.toString());
  assert.equal(escapedPattern.pagination.total, 0);
});

test("student listings exclude administrator accounts", async () => {
  await Student.create({
    studentId: uniqueStudentId(),
    fullName: "Admin Account",
    passwordHash: await bcrypt.hash("admin-test-password-876", 4),
    role: "admin",
    status: "active",
  });

  const result = await listStudents({ page: 1, limit: 100 });
  assert.equal(result.students.some((student) => student.role === "admin"), false);
});

test("deactivates without deleting history and allows contact removal", async () => {
  const created = await createStudentAccount({
    studentId: uniqueStudentId(),
    fullName: "Keep History",
    email: "history@example.test",
    phone: "+919876543210",
    password: "history-student-password-876",
  });

  const updated = await updateStudentAccount(created._id.toString(), {
    status: "inactive",
    email: "",
    phone: "",
  });
  const stillExists = await Student.findById(created._id);

  assert.equal(updated.status, "inactive");
  assert.equal(updated.email, undefined);
  assert.equal(updated.phone, undefined);
  assert.equal(stillExists?._id.toString(), created._id.toString());
});
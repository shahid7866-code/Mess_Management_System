import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import mongoose from "mongoose";
import { ApiError } from "../src/lib/api-response";
import { connectDB } from "../src/lib/mongodb";
import {
  createHoliday,
  currentIndiaDateKey,
  getAttendanceSession,
  getDailyMealData,
  getMealSchedules,
  markAttendance,
  markStudentAttendance,
  parseServiceDate,
  saveDailyMenu,
  updateMealSchedule,
} from "../src/lib/meal-service";
import { Attendance } from "../src/models/Attendance";
import { DailyMenu } from "../src/models/DailyMenu";
import { MealSchedule } from "../src/models/MealSchedule";
import { MessHoliday } from "../src/models/MessHoliday";
import { Student } from "../src/models/Student";
import { Subscription } from "../src/models/Subscription";

const testDatabasePrefix = "mess_management_meals_test_";
let testDatabaseName = "";
let testDatabaseWasVerifiedNew = false;
let originalMongoUri: string | undefined;
let studentSequence = 0;

before(async () => {
  const configuredUri = process.env.MONGODB_URI;
  assert.ok(configuredUri, "MONGODB_URI must be set to run meal integration tests");

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
  assert.equal(databaseWasAbsent, true, "Refusing to use an existing meal test database");
  testDatabaseWasVerifiedNew = true;

  originalMongoUri = configuredUri;
  process.env.MONGODB_URI = testUri.toString();
  await connectDB();
  await Promise.all([
    Student.syncIndexes(),
    Subscription.syncIndexes(),
    MealSchedule.syncIndexes(),
    DailyMenu.syncIndexes(),
    MessHoliday.syncIndexes(),
    Attendance.syncIndexes(),
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

function studentId(): string {
  studentSequence += 1;
  return `MEAL-${studentSequence}`;
}

async function createStudent(name = "Meal Test Student") {
  return Student.create({
    studentId: studentId(),
    fullName: name,
    passwordHash: `$2b$12$${"A".repeat(53)}`,
    role: "student",
    status: "active",
  });
}

async function subscribe(
  id: mongoose.Types.ObjectId,
  plan: "afternoon" | "night" | "both",
  startDate: Date,
  endDate: Date,
) {
  return Subscription.createForStudent({ student: id, plan, startDate, endDate });
}

test("uses valid dates, configurable meal windows, and date-keyed menus", async () => {
  const dateKey = currentIndiaDateKey();
  const { date } = parseServiceDate(dateKey);
  assert.equal(date.toISOString(), `${dateKey}T00:00:00.000Z`);
  assert.throws(() => parseServiceDate("2026-02-30"), ApiError);

  const defaults = await getMealSchedules();
  assert.deepEqual(
    defaults.map(({ meal, openingTime, closingTime }) => ({ meal, openingTime, closingTime })),
    [
      { meal: "afternoon", openingTime: "11:00", closingTime: "14:00" },
      { meal: "night", openingTime: "18:00", closingTime: "22:00" },
    ],
  );

  await assert.rejects(
    updateMealSchedule("afternoon", "14:00", "11:00", new mongoose.Types.ObjectId().toString()),
    (error: unknown) => error instanceof ApiError && error.code === "INVALID_MEAL_SCHEDULE",
  );
  await updateMealSchedule(
    "afternoon",
    "10:00",
    "12:00",
    new mongoose.Types.ObjectId().toString(),
  );

  await saveDailyMenu(dateKey, ["Roti", "Dal"], ["Rice", "Vegetables"], new mongoose.Types.ObjectId().toString());
  const data = await getDailyMealData(dateKey);
  assert.deepEqual(data.menu?.afternoonItems, ["Roti", "Dal"]);
  assert.deepEqual(data.menu?.nightItems, ["Rice", "Vegetables"]);
});

test("attendance lists only active meal-eligible students and keeps Not Marked distinct", async () => {
  const dateKey = currentIndiaDateKey();
  const { date } = parseServiceDate(dateKey);
  const tomorrow = new Date(date.getTime() + 86_400_000);
  const afternoonStudent = await createStudent("Afternoon Student");
  const nightStudent = await createStudent("Night Student");
  const bothStudent = await createStudent("Both Student");
  const expiredStudent = await createStudent("Expired Student");
  const inactiveStudent = await createStudent("Inactive Student");

  await Promise.all([
    subscribe(afternoonStudent._id, "afternoon", date, tomorrow),
    subscribe(nightStudent._id, "night", date, tomorrow),
    subscribe(bothStudent._id, "both", date, tomorrow),
    subscribe(expiredStudent._id, "afternoon", new Date(date.getTime() - 86_400_000), date),
    subscribe(inactiveStudent._id, "afternoon", date, tomorrow),
  ]);
  await Student.updateOne({ _id: inactiveStudent._id }, { $set: { status: "inactive" } });

  const now = new Date(`${dateKey}T06:30:00.000Z`);
  const afternoon = await getAttendanceSession(dateKey, "afternoon", now);
  const night = await getAttendanceSession(dateKey, "night", now);

  assert.deepEqual(
    afternoon.students.map((student) => student.studentId).sort(),
    [afternoonStudent.studentId, bothStudent.studentId].sort(),
  );
  assert.deepEqual(
    night.students.map((student) => student.studentId),
    [nightStudent.studentId, bothStudent.studentId],
  );
  assert.equal(afternoon.summary.notMarked, 2);
  assert.equal(afternoon.summary.absent, 0);
  assert.equal(afternoon.students[0].attendance.status, "not_marked");
});

test("marks eligible attendance once and enforces the compound unique index", async () => {
  const dateKey = currentIndiaDateKey();
  const { date } = parseServiceDate(dateKey);
  const student = await createStudent();
  const operator = await Student.create({
    studentId: "MEAL-ADMIN",
    fullName: "Meal Test Admin",
    passwordHash: `$2b$12$${"B".repeat(53)}`,
    role: "admin",
    status: "active",
  });
  await subscribe(student._id, "afternoon", date, new Date(date.getTime() + 86_400_000));

  const withinWindow = new Date(`${dateKey}T06:00:00.000Z`);
  await markAttendance({
    studentId: student.id,
    serviceDate: dateKey,
    meal: "afternoon",
    status: "present",
    operatorId: operator.id,
    now: withinWindow,
  });
  await markAttendance({
    studentId: student.id,
    serviceDate: dateKey,
    meal: "afternoon",
    status: "on_leave",
    operatorId: operator.id,
    correctionReason: "Authorized status correction",
    now: withinWindow,
  });

  assert.equal(
    await Attendance.countDocuments({ student: student._id, serviceDate: date, meal: "afternoon" }),
    1,
  );
  const correctedAttendance = await Attendance.findOne({ student: student._id, serviceDate: date }).lean();
  assert.equal(correctedAttendance?.status, "on_leave");
  assert.equal(correctedAttendance?.correctionHistory.length, 1);
  assert.equal(correctedAttendance?.correctionHistory[0].previousStatus, "present");
  assert.equal(correctedAttendance?.correctionHistory[0].newStatus, "on_leave");
  assert.equal(correctedAttendance?.correctionHistory[0].reason, "Authorized status correction");
  const indexes = await Attendance.collection.indexes();
  assert.ok(indexes.some((index) => index.unique && index.key.student === 1 && index.key.serviceDate === 1 && index.key.meal === 1));

  await assert.rejects(
    Attendance.create({
      student: student._id,
      serviceDate: date,
      meal: "afternoon",
      status: "absent",
      markedAt: withinWindow,
      markedBy: operator._id,
    }),
    (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === 11000,
  );
});

test("blocks meal mismatch, inactive students, closed windows, holidays, and future dates", async () => {
  const dateKey = currentIndiaDateKey();
  const { date } = parseServiceDate(dateKey);
  const student = await createStudent();
  const operator = await Student.create({
    studentId: "MEAL-ADMIN-2",
    fullName: "Meal Test Admin 2",
    passwordHash: `$2b$12$${"C".repeat(53)}`,
    role: "admin",
    status: "active",
  });
  await subscribe(student._id, "night", date, new Date(date.getTime() + 86_400_000));
  const withinAfternoon = new Date(`${dateKey}T06:30:00.000Z`);

  await assert.rejects(
    markAttendance({
      studentId: student.id,
      serviceDate: dateKey,
      meal: "afternoon",
      status: "present",
      operatorId: operator.id,
      now: withinAfternoon,
    }),
    (error: unknown) => error instanceof ApiError && error.code === "STUDENT_NOT_ELIGIBLE",
  );

  await Student.updateOne({ _id: student._id }, { $set: { status: "inactive" } });
  await assert.rejects(
    markAttendance({
      studentId: student.id,
      serviceDate: dateKey,
      meal: "night",
      status: "present",
      operatorId: operator.id,
      now: new Date(`${dateKey}T13:00:00.000Z`),
    }),
    (error: unknown) => error instanceof ApiError && error.code === "STUDENT_NOT_FOUND",
  );

  const exceptionDate = new Date(date.getTime() + 86_400_000);
  await createHoliday({
    serviceDate: exceptionDate.toISOString().slice(0, 10),
    reason: "Mess maintenance",
    attendanceExceptionAllowed: false,
    operatorId: operator.id,
  });
  await assert.rejects(
    markAttendance({
      studentId: student.id,
      serviceDate: exceptionDate.toISOString().slice(0, 10),
      meal: "night",
      status: "present",
      operatorId: operator.id,
      correctionReason: "Authorized test correction",
      now: withinAfternoon,
    }),
    (error: unknown) => error instanceof ApiError && error.code === "FUTURE_ATTENDANCE",
  );

  const pastDate = new Date(date.getTime() - 86_400_000).toISOString().slice(0, 10);
  await createHoliday({
    serviceDate: pastDate,
    reason: "Holiday closure",
    attendanceExceptionAllowed: false,
    operatorId: operator.id,
  });
  await Student.updateOne({ _id: student._id }, { $set: { status: "active" } });
  await assert.rejects(
    markAttendance({
      studentId: student.id,
      serviceDate: pastDate,
      meal: "night",
      status: "present",
      operatorId: operator.id,
      correctionReason: "Authorized test correction",
      now: withinAfternoon,
    }),
    (error: unknown) => error instanceof ApiError && error.code === "MESS_HOLIDAY",
  );
});

test("students self-mark once and their attendance appears in the admin roster", async () => {
  const dateKey = currentIndiaDateKey();
  const { date } = parseServiceDate(dateKey);
  const student = await createStudent("Self Mark Student");
  const now = new Date(`${dateKey}T13:00:00.000Z`);
  await subscribe(student._id, "night", date, new Date(date.getTime() + 86_400_000));

  const record = await markStudentAttendance({
    studentId: student.id,
    meal: "night",
    status: "present",
    now,
  });

  assert.equal(record.student.toString(), student.id);
  assert.equal(record.markedBy.toString(), student.id);
  assert.equal(record.status, "present");
  await assert.rejects(
    markStudentAttendance({
      studentId: student.id,
      meal: "night",
      status: "absent",
      now,
    }),
    (error: unknown) =>
      error instanceof ApiError && error.code === "ATTENDANCE_ALREADY_MARKED",
  );

  const roster = await getAttendanceSession(dateKey, "night", now);
  assert.equal(roster.summary.present, 1);
  const rosterStudent = roster.students.find(
    (rosterEntry) => rosterEntry._id.toString() === student.id,
  );
  assert.equal(rosterStudent?.attendance.status, "present");
});
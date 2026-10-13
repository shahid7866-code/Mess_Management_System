import "server-only";
import { Types } from "mongoose";
import { ApiError } from "@/lib/api-response";
import { connectDB } from "@/lib/mongodb";
import { Attendance, type AttendanceStatus } from "@/models/Attendance";
import { DailyMenu } from "@/models/DailyMenu";
import { MealSchedule, type MealSession } from "@/models/MealSchedule";
import { MessHoliday } from "@/models/MessHoliday";
import { Student } from "@/models/Student";
import { Subscription } from "@/models/Subscription";

export const MESS_TIMEZONE = "Asia/Kolkata";

export const DEFAULT_MEAL_SCHEDULES: Record<
  MealSession,
  { openingTime: string; closingTime: string }
> = {
  afternoon: { openingTime: "11:00", closingTime: "14:00" },
  night: { openingTime: "18:00", closingTime: "22:00" },
};

export interface MealServiceDate {
  dateKey: string;
  date: Date;
}

export function parseServiceDate(value: string): MealServiceDate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError({
      status: 400,
      code: "INVALID_SERVICE_DATE",
      message: "Service date must use YYYY-MM-DD format",
    });
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ApiError({
      status: 400,
      code: "INVALID_SERVICE_DATE",
      message: "Service date is not a valid calendar date",
    });
  }

  return { dateKey: value, date };
}

export function currentIndiaDateKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function currentIndiaTime(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: MESS_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "00";
  return `${part("hour")}:${part("minute")}`;
}

export async function getMealSchedules() {
  await connectDB();
  const schedules = await MealSchedule.find().sort({ meal: 1 }).lean();
  const byMeal = new Map(schedules.map((schedule) => [schedule.meal, schedule]));

  return (["afternoon", "night"] as const).map((meal) => ({
    meal,
    ...(byMeal.get(meal) ?? DEFAULT_MEAL_SCHEDULES[meal]),
    timezone: MESS_TIMEZONE,
  }));
}

export async function updateMealSchedule(
  meal: MealSession,
  openingTime: string,
  closingTime: string,
  operatorId: string,
) {
  await connectDB();
  if (closingTime <= openingTime) {
    throw new ApiError({
      status: 400,
      code: "INVALID_MEAL_SCHEDULE",
      message: "Closing time must be later than opening time",
    });
  }

  return MealSchedule.findOneAndUpdate(
    { meal },
    {
      $set: {
        openingTime,
        closingTime,
        timezone: MESS_TIMEZONE,
        updatedBy: new Types.ObjectId(operatorId),
      },
    },
    { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true },
  ).lean();
}

export async function getDailyMealData(dateKey: string) {
  await connectDB();
  const { date } = parseServiceDate(dateKey);
  const [menu, holiday] = await Promise.all([
    DailyMenu.findOne({ serviceDate: date }).lean(),
    MessHoliday.findOne({ serviceDate: date }).lean(),
  ]);

  return { serviceDate: dateKey, menu, holiday, timezone: MESS_TIMEZONE };
}

export async function saveDailyMenu(
  dateKey: string,
  afternoonItems: string[],
  nightItems: string[],
  operatorId: string,
) {
  await connectDB();
  const { date } = parseServiceDate(dateKey);
  return DailyMenu.findOneAndUpdate(
    { serviceDate: date },
    {
      $set: {
        afternoonItems,
        nightItems,
        updatedBy: new Types.ObjectId(operatorId),
      },
    },
    { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true },
  ).lean();
}

export async function listHolidays(from?: string, to?: string) {
  await connectDB();
  const filter: { serviceDate?: { $gte?: Date; $lt?: Date } } = {};
  if (from || to) {
    filter.serviceDate = {};
    if (from) filter.serviceDate.$gte = parseServiceDate(from).date;
    if (to) {
      const endDate = parseServiceDate(to).date;
      filter.serviceDate.$lt = new Date(endDate.getTime() + 86_400_000);
    }
  }

  return MessHoliday.find(filter).sort({ serviceDate: 1 }).lean();
}

export async function createHoliday(input: {
  serviceDate: string;
  reason: string;
  attendanceExceptionAllowed: boolean;
  exceptionReason?: string;
  operatorId: string;
}) {
  await connectDB();
  const { date } = parseServiceDate(input.serviceDate);
  return MessHoliday.create({
    serviceDate: date,
    reason: input.reason,
    attendanceExceptionAllowed: input.attendanceExceptionAllowed,
    exceptionReason: input.exceptionReason,
    createdBy: new Types.ObjectId(input.operatorId),
  });
}

export async function getAttendanceSession(
  serviceDate: string,
  meal: MealSession,
  now = new Date(),
) {
  await connectDB();
  const { date } = parseServiceDate(serviceDate);
  const [scheduleDocument, holiday, menu] = await Promise.all([
    MealSchedule.findOne({ meal }).lean(),
    MessHoliday.findOne({ serviceDate: date }).lean(),
    DailyMenu.findOne({ serviceDate: date }).lean(),
  ]);

  const schedule = {
    meal,
    ...(scheduleDocument ?? DEFAULT_MEAL_SCHEDULES[meal]),
    timezone: MESS_TIMEZONE,
  };
  const localTime = currentIndiaTime(now);
  const sameDay = currentIndiaDateKey(now) === serviceDate;
  const windowOpen = localTime >= schedule.openingTime && localTime < schedule.closingTime;
  const holidayBlocked = Boolean(holiday && !holiday.attendanceExceptionAllowed);
  const isOpen = sameDay && windowOpen && !holidayBlocked;

  const subscriptionStudentIds = await Subscription.distinct("student", {
    status: "active",
    plan: { $in: [meal, "both"] },
    startDate: { $lte: date },
    endDate: { $gt: date },
  });
  const eligibleStudents = await Student.find({
    _id: { $in: subscriptionStudentIds },
    role: "student",
    status: "active",
  })
    .select("studentId fullName email phone")
    .sort({ studentId: 1 })
    .lean();

  const eligibleIds = eligibleStudents.map((student) => student._id);
  const attendanceRecords = await Attendance.find({
    student: { $in: eligibleIds },
    serviceDate: date,
    meal,
  }).lean();
  const attendanceByStudent = new Map(
    attendanceRecords.map((record) => [record.student.toString(), record]),
  );
  const students = eligibleStudents.map((student) => {
    const record = attendanceByStudent.get(student._id.toString());
    return {
      ...student,
      attendance: record
        ? {
            id: record._id.toString(),
            status: record.status,
            markedAt: record.markedAt,
            correctionReason: record.correctionReason,
          }
        : { status: "not_marked" as const, markedAt: null },
    };
  });

  return {
    serviceDate,
    meal,
    timezone: MESS_TIMEZONE,
    schedule,
    isOpen,
    localTime,
    holiday,
    menu,
    students,
    summary: {
      eligible: students.length,
      present: students.filter((student) => student.attendance.status === "present").length,
      absent: students.filter((student) => student.attendance.status === "absent").length,
      onLeave: students.filter((student) => student.attendance.status === "on_leave").length,
      notMarked: students.filter((student) => student.attendance.status === "not_marked").length,
    },
  };
}

export async function markAttendance(input: {
  studentId: string;
  serviceDate: string;
  meal: MealSession;
  status: AttendanceStatus;
  correctionReason?: string;
  operatorId: string;
  now?: Date;
  selfMark?: boolean;
}) {
  await connectDB();
  if (!Types.ObjectId.isValid(input.studentId)) {
    throw new ApiError({
      status: 400,
      code: "INVALID_STUDENT_ID",
      message: "Student identifier is invalid",
    });
  }

  const { date } = parseServiceDate(input.serviceDate);
  const serviceDayKey = date.toISOString().slice(0, 10);
  const todayKey = currentIndiaDateKey(input.now);
  if (serviceDayKey > todayKey) {
    throw new ApiError({
      status: 422,
      code: "FUTURE_ATTENDANCE",
      message: "Attendance cannot be recorded for a future service date",
    });
  }

  const [student, scheduleDocument, holiday] = await Promise.all([
    Student.findOne({
      _id: input.studentId,
      role: "student",
      status: "active",
    }).select("_id"),
    MealSchedule.findOne({ meal: input.meal }).lean(),
    MessHoliday.findOne({ serviceDate: date }).lean(),
  ]);

  if (!student) {
    throw new ApiError({
      status: 404,
      code: "STUDENT_NOT_FOUND",
      message: "Active student was not found",
    });
  }

  if (holiday && !holiday.attendanceExceptionAllowed) {
    throw new ApiError({
      status: 409,
      code: "MESS_HOLIDAY",
      message: "Attendance is closed for this mess holiday",
    });
  }

  const eligible = await Subscription.exists({
    student: student._id,
    status: "active",
    plan: { $in: [input.meal, "both"] },
    startDate: { $lte: date },
    endDate: { $gt: date },
  });
  if (!eligible) {
    throw new ApiError({
      status: 409,
      code: "STUDENT_NOT_ELIGIBLE",
      message: "Student has no active subscription for this meal and date",
    });
  }

  const schedule = scheduleDocument ?? DEFAULT_MEAL_SCHEDULES[input.meal];
  const now = input.now ?? new Date();
  const isWithinWindow =
    currentIndiaDateKey(now) === serviceDayKey &&
    currentIndiaTime(now) >= schedule.openingTime &&
    currentIndiaTime(now) < schedule.closingTime;
  const hasCorrectionReason = (input.correctionReason?.trim().length ?? 0) >= 8;
  if (!isWithinWindow && !hasCorrectionReason) {
    throw new ApiError({
      status: 409,
      code: "ATTENDANCE_WINDOW_CLOSED",
      message: "The attendance window is closed; an authorized correction reason is required",
    });
  }

  if (holiday?.attendanceExceptionAllowed && !hasCorrectionReason) {
    throw new ApiError({
      status: 422,
      code: "EXCEPTION_REASON_REQUIRED",
      message: "An authorized holiday attendance exception requires a correction reason",
    });
  }

  const existingAttendance = await Attendance.findOne({
    student: student._id,
    serviceDate: date,
    meal: input.meal,
  }).select("status").lean();

  if (input.selfMark && existingAttendance) {
    throw new ApiError({
      status: 409,
      code: "ATTENDANCE_ALREADY_MARKED",
      message: "Attendance has already been marked for this meal",
    });
  }

  if (input.selfMark) {
    try {
      return await Attendance.create({
        student: student._id,
        serviceDate: date,
        meal: input.meal,
        status: input.status,
        markedAt: now,
        markedBy: new Types.ObjectId(input.operatorId),
      });
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === 11000
      ) {
        throw new ApiError({
          status: 409,
          code: "ATTENDANCE_ALREADY_MARKED",
          message: "Attendance has already been marked for this meal",
        });
      }
      throw error;
    }
  }

  const update: Record<string, unknown> = {
    $set: {
      status: input.status,
      markedAt: now,
      markedBy: new Types.ObjectId(input.operatorId),
      correctionReason: input.correctionReason?.trim() || undefined,
    },
  };
  if (existingAttendance) {
    update.$push = {
      correctionHistory: {
        previousStatus: existingAttendance.status,
        newStatus: input.status,
        changedAt: now,
        changedBy: new Types.ObjectId(input.operatorId),
        reason: input.correctionReason?.trim() || undefined,
      },
    };
  }

  return Attendance.findOneAndUpdate(
    {
      student: student._id,
      serviceDate: date,
      meal: input.meal,
    },
    update,
    { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true },
  ).lean();
}

export async function markStudentAttendance(input: {
  studentId: string;
  meal: MealSession;
  status: "present" | "absent";
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return markAttendance({
    ...input,
    serviceDate: currentIndiaDateKey(now),
    operatorId: input.studentId,
    now,
    selfMark: true,
  });
}
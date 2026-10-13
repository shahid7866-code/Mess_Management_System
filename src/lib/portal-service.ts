import "server-only";
import { Types } from "mongoose";
import { ApiError } from "@/lib/api-response";
import { subscriptionChargePaise } from "@/lib/billing";
import { connectDB } from "@/lib/mongodb";
import { getDailyMealData, currentIndiaDateKey, parseServiceDate } from "@/lib/meal-service";
import { Attendance } from "@/models/Attendance";
import { Payment } from "@/models/Payment";
import { Student } from "@/models/Student";
import {
  OverlappingSubscriptionError,
  SUBSCRIPTION_PRICES_PAISE,
  Subscription,
  type SubscriptionPlan,
} from "@/models/Subscription";

function addCalendarMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

export async function createStudentSubscription(input: {
  studentId: string;
  plan: SubscriptionPlan;
  months: number;
  startDate: string;
}) {
  await connectDB();
  if (!Types.ObjectId.isValid(input.studentId)) {
    throw new ApiError({ status: 400, code: "INVALID_ID", message: "Student identifier is invalid" });
  }
  if (!Number.isInteger(input.months) || input.months < 1 || input.months > 12) {
    throw new ApiError({ status: 400, code: "INVALID_TERM", message: "Subscription term must be from 1 to 12 months" });
  }

  const startDate = parseServiceDate(input.startDate);
  if (startDate.dateKey < currentIndiaDateKey()) {
    throw new ApiError({ status: 422, code: "PAST_SUBSCRIPTION_START", message: "Subscription cannot start in the past" });
  }
  const endDate = addCalendarMonths(startDate.date, input.months);

  try {
    return await Subscription.createForStudent({
      student: input.studentId,
      plan: input.plan,
      startDate: startDate.date,
      endDate,
    });
  } catch (error: unknown) {
    if (error instanceof OverlappingSubscriptionError) {
      throw new ApiError({
        status: 409,
        code: "SUBSCRIPTION_PERIOD_OVERLAP",
        message: "An active subscription already covers those dates",
      });
    }
    if (error instanceof Error && error.message === "Student not found") {
      throw new ApiError({ status: 404, code: "STUDENT_NOT_FOUND", message: "Student account was not found" });
    }
    throw error;
  }
}

export async function getStudentPortalData(studentId: string) {
  await connectDB();
  if (!Types.ObjectId.isValid(studentId)) {
    throw new ApiError({ status: 400, code: "INVALID_ID", message: "Student identifier is invalid" });
  }

  const dateKey = currentIndiaDateKey();
  const today = new Date(`${dateKey}T00:00:00.000Z`);
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const student = await Student.findOne({
    _id: studentId,
    role: "student",
    status: "active",
  })
    .select("studentId fullName email phone role status createdAt")
    .lean();

  if (!student) {
    throw new ApiError({ status: 404, code: "STUDENT_NOT_FOUND", message: "Student account was not found" });
  }

  const [subscriptions, payments, attendance, meals] = await Promise.all([
    Subscription.find({ student: student._id }).sort({ startDate: -1 }).lean(),
    Payment.find({ student: student._id }).sort({ receivedAt: -1 }).limit(50).lean(),
    Attendance.find({ student: student._id }).sort({ serviceDate: -1, meal: 1 }).limit(60).lean(),
    getDailyMealData(dateKey),
  ]);

  const currentSubscription = subscriptions.find(
    (subscription) =>
      subscription.status === "active" &&
      subscription.startDate <= today &&
      subscription.endDate > today,
  );

  let subscriptionSummary = null;
  if (currentSubscription) {
    const received = await Payment.aggregate([
      { $match: { subscription: currentSubscription._id, status: "received" } },
      { $group: { _id: null, amountPaise: { $sum: "$amountPaise" } } },
    ]);
    const chargePaise = subscriptionChargePaise(currentSubscription);
    const paidPaise = received[0]?.amountPaise ?? 0;
    subscriptionSummary = {
      ...currentSubscription,
      id: currentSubscription._id.toString(),
      chargePaise,
      paidPaise,
      outstandingPaise: Math.max(chargePaise - paidPaise, 0),
      afternoonEligible: currentSubscription.plan === "afternoon" || currentSubscription.plan === "both",
      nightEligible: currentSubscription.plan === "night" || currentSubscription.plan === "both",
    };
  }

  return {
    profile: student,
    serviceDate: dateKey,
    timezone: "Asia/Kolkata",
    planPricesPaise: SUBSCRIPTION_PRICES_PAISE,
    nextSubscriptionStartDate: subscriptions
      .filter((subscription) => subscription.status === "active" && subscription.endDate > today)
      .reduce((nextDate, subscription) => subscription.endDate > nextDate ? subscription.endDate : nextDate, today)
      .toISOString()
      .slice(0, 10),
    subscription: subscriptionSummary,
    subscriptions: subscriptions.map((subscription) => ({
      id: subscription._id.toString(),
      plan: subscription.plan,
      status: subscription.status,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      monthlyAmountPaise: subscription.monthlyAmountPaise,
    })),
    payments: payments.map((payment) => ({
      id: payment._id.toString(),
      receiptRef: payment.receiptRef,
      amountPaise: payment.amountPaise,
      method: payment.method,
      receivedAt: payment.receivedAt,
      status: payment.status,
    })),
    attendance: attendance.map((record) => ({
      id: record._id.toString(),
      serviceDate: record.serviceDate,
      meal: record.meal,
      status: record.status,
      markedAt: record.markedAt,
    })),
    menu: meals.menu,
    holiday: meals.holiday,
    eligibility: {
      afternoon: Boolean(subscriptionSummary?.afternoonEligible),
      night: Boolean(subscriptionSummary?.nightEligible),
    },
    subscriptionsExpiringSoon: subscriptions.filter(
      (subscription) =>
        subscription.status === "active" &&
        subscription.endDate > today &&
        subscription.endDate <= tomorrow,
    ).length,
  };
}
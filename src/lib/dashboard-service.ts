import "server-only";
import { connectDB } from "@/lib/mongodb";
import { currentIndiaDateKey, getAttendanceSession, getDailyMealData, parseServiceDate } from "@/lib/meal-service";
import { Expense } from "@/models/Expense";
import { Payment } from "@/models/Payment";
import { Student } from "@/models/Student";
import { Subscription } from "@/models/Subscription";
import { subscriptionChargePaise } from "@/lib/billing";

async function sumAmount(
  model: typeof Payment | typeof Expense,
  filter: Record<string, unknown>,
): Promise<number> {
  const result = await model.aggregate([
    { $match: filter },
    { $group: { _id: null, amountPaise: { $sum: "$amountPaise" } } },
  ]);
  return result[0]?.amountPaise ?? 0;
}

export async function getDashboardData(adminName: string) {
  await connectDB();

  const dateKey = currentIndiaDateKey();
  const today = parseServiceDate(dateKey).date;
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
  const indiaOffsetMs = 330 * 60_000;
  const todayInstant = new Date(today.getTime() - indiaOffsetMs);
  const tomorrowInstant = new Date(tomorrow.getTime() - indiaOffsetMs);
  const monthStartInstant = new Date(monthStart.getTime() - indiaOffsetMs);
  const monthEndInstant = new Date(monthEnd.getTime() - indiaOffsetMs);

  const [
    activeStudents,
    afternoon,
    night,
    dailyMeals,
    todayCollectionsPaise,
    monthlyCollectionsPaise,
    todayExpensesPaise,
    monthlyExpensesPaise,
    subscriptions,
    paymentTotals,
    monthlyExpenseCategories,
  ] = await Promise.all([
    Student.countDocuments({ role: "student", status: "active" }),
    getAttendanceSession(dateKey, "afternoon"),
    getAttendanceSession(dateKey, "night"),
    getDailyMealData(dateKey),
    sumAmount(Payment, { status: "received", receivedAt: { $gte: todayInstant, $lt: tomorrowInstant } }),
    sumAmount(Payment, { status: "received", receivedAt: { $gte: monthStartInstant, $lt: monthEndInstant } }),
    sumAmount(Expense, { status: "recorded", expenseDate: { $gte: today, $lt: tomorrow } }),
    sumAmount(Expense, { status: "recorded", expenseDate: { $gte: monthStart, $lt: monthEnd } }),
    Subscription.find({ status: { $in: ["active", "expired"] } }).lean(),
    Payment.aggregate([
      { $match: { status: "received" } },
      { $group: { _id: "$subscription", receivedPaise: { $sum: "$amountPaise" } } },
    ]),
    Expense.aggregate([
      { $match: { status: "recorded", expenseDate: { $gte: monthStart, $lt: monthEnd } } },
      { $group: { _id: "$category", amountPaise: { $sum: "$amountPaise" } } },
      { $sort: { amountPaise: -1 } },
    ]),
  ]);

  const receivedBySubscription = new Map(
    paymentTotals.map((item: { _id: { toString(): string }; receivedPaise: number }) => [
      item._id.toString(),
      item.receivedPaise,
    ]),
  );
  const outstandingPaise = subscriptions.reduce((total, subscription) => {
    const accruedEnd = subscription.endDate < tomorrow ? subscription.endDate : tomorrow;
    const charge = accruedEnd > subscription.startDate
      ? subscriptionChargePaise({ ...subscription, endDate: accruedEnd })
      : 0;
    const received = receivedBySubscription.get(subscription._id.toString()) ?? 0;
    return total + Math.max(charge - received, 0);
  }, 0);

  return {
    date: dateKey,
    adminName,
    activeStudents,
    eligibleAfternoon: afternoon.summary.eligible,
    eligibleNight: night.summary.eligible,
    attendance: {
      afternoon: { isOpen: afternoon.isOpen, summary: afternoon.summary },
      night: { isOpen: night.isOpen, summary: night.summary },
    },
    menu: dailyMeals.menu
      ? {
          afternoonItems: [...dailyMeals.menu.afternoonItems],
          nightItems: [...dailyMeals.menu.nightItems],
        }
      : null,
    holiday: dailyMeals.holiday
      ? {
          reason: dailyMeals.holiday.reason,
          attendanceExceptionAllowed: dailyMeals.holiday.attendanceExceptionAllowed,
        }
      : null,
    todayCollectionsPaise,
    monthlyCollectionsPaise,
    todayExpensesPaise,
    monthlyExpensesPaise,
    monthlyNetCashProfitPaise: monthlyCollectionsPaise - monthlyExpensesPaise,
    monthlyExpensesByCategory: monthlyExpenseCategories.map((item: { _id: string; amountPaise: number }) => ({
      category: item._id,
      amountPaise: item.amountPaise,
    })),
    outstandingPaise,
  };
}

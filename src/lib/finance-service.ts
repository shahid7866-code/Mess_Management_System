import "server-only";
import { randomUUID } from "node:crypto";
import { Types } from "mongoose";
import { ApiError } from "@/lib/api-response";
import { subscriptionChargePaise } from "@/lib/billing";
import { connectDB } from "@/lib/mongodb";
import { Expense, type ExpenseCategory } from "@/models/Expense";
import { Payment, type PaymentMethod } from "@/models/Payment";
import { Subscription } from "@/models/Subscription";
import { currentIndiaDateKey, parseServiceDate } from "@/lib/meal-service";

const PAYMENT_LOCK_LEASE_MS = 60_000;
const PAYMENT_LOCK_WAIT_MS = 5_000;
const INDIA_TIME_OFFSET_MS = 330 * 60_000;

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

function rangeSubscriptionCharge(
  subscription: {
    startDate: Date;
    endDate: Date;
    monthlyAmountPaise: number;
  },
  rangeStart: Date,
  rangeEndExclusive: Date,
): number {
  const start = subscription.startDate > rangeStart ? subscription.startDate : rangeStart;
  const end = subscription.endDate < rangeEndExclusive ? subscription.endDate : rangeEndExclusive;
  if (end <= start) return 0;
  return subscriptionChargePaise({ ...subscription, startDate: start, endDate: end });
}

async function acquirePaymentLock(subscriptionId: Types.ObjectId): Promise<string> {
  const token = randomUUID();
  const deadline = Date.now() + PAYMENT_LOCK_WAIT_MS;

  while (Date.now() < deadline) {
    const now = new Date();
    const locked = await Subscription.findOneAndUpdate(
      {
        _id: subscriptionId,
        $or: [
          { paymentLockExpiresAt: { $exists: false } },
          { paymentLockExpiresAt: { $lte: now } },
        ],
      },
      {
        $set: {
          paymentLockToken: token,
          paymentLockExpiresAt: new Date(now.getTime() + PAYMENT_LOCK_LEASE_MS),
        },
      },
      { returnDocument: "after", projection: { _id: 1 } },
    );

    if (locked) return token;
    if (!(await Subscription.exists({ _id: subscriptionId }))) {
      throw new ApiError({ status: 404, code: "SUBSCRIPTION_NOT_FOUND", message: "Subscription was not found" });
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new ApiError({ status: 409, code: "PAYMENT_BUSY", message: "Another payment update is in progress" });
}

async function releasePaymentLock(subscriptionId: Types.ObjectId, token: string): Promise<void> {
  await Subscription.updateOne(
    { _id: subscriptionId, paymentLockToken: token },
    { $unset: { paymentLockToken: 1, paymentLockExpiresAt: 1 } },
  );
}

async function subscriptionLedger(subscriptionId: Types.ObjectId) {
  const subscription = await Subscription.findById(subscriptionId).lean();
  if (!subscription) {
    throw new ApiError({ status: 404, code: "SUBSCRIPTION_NOT_FOUND", message: "Subscription was not found" });
  }

  const totalChargePaise = subscriptionChargePaise(subscription);
  const paymentTotals = await Payment.aggregate([
    { $match: { subscription: subscriptionId, status: "received" } },
    { $group: { _id: null, receivedPaise: { $sum: "$amountPaise" } } },
  ]);
  const receivedPaise = paymentTotals[0]?.receivedPaise ?? 0;
  return {
    subscription,
    totalChargePaise,
    receivedPaise,
    outstandingPaise: Math.max(totalChargePaise - receivedPaise, 0),
  };
}

export async function getSubscriptionLedger(subscriptionId: string) {
  await connectDB();
  if (!Types.ObjectId.isValid(subscriptionId)) {
    throw new ApiError({ status: 400, code: "INVALID_ID", message: "Subscription id is invalid" });
  }

  const ledger = await subscriptionLedger(new Types.ObjectId(subscriptionId));
  const payments = await Payment.find({ subscription: subscriptionId })
    .sort({ receivedAt: -1 })
    .lean();
  return { ...ledger, payments };
}

export async function recordPayment(input: {
  subscriptionId: string;
  amountPaise: number;
  method: PaymentMethod;
  idempotencyKey: string;
  operatorId: string;
}) {
  await connectDB();
  if (!Types.ObjectId.isValid(input.subscriptionId) || !Types.ObjectId.isValid(input.operatorId)) {
    throw new ApiError({ status: 400, code: "INVALID_ID", message: "A supplied identifier is invalid" });
  }
  if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise < 1) {
    throw new ApiError({ status: 400, code: "INVALID_AMOUNT", message: "Payment must be a positive integer amount of paise" });
  }

  const subscriptionId = new Types.ObjectId(input.subscriptionId);
  const priorPayment = await Payment.findOne({ idempotencyKey: input.idempotencyKey }).lean();
  if (priorPayment) {
    if (
      priorPayment.subscription.toString() !== input.subscriptionId ||
      priorPayment.amountPaise !== input.amountPaise ||
      priorPayment.method !== input.method
    ) {
      throw new ApiError({ status: 409, code: "IDEMPOTENCY_KEY_REUSED", message: "Payment request key was already used for different details" });
    }
    return priorPayment;
  }

  const lockToken = await acquirePaymentLock(subscriptionId);
  try {
    const duplicate = await Payment.findOne({ idempotencyKey: input.idempotencyKey }).lean();
    if (duplicate) return duplicate;

    const ledger = await subscriptionLedger(subscriptionId);
    if (input.amountPaise > ledger.outstandingPaise) {
      throw new ApiError({ status: 422, code: "PAYMENT_EXCEEDS_BALANCE", message: "Payment exceeds the remaining subscription balance" });
    }

    const receiptRef = `MM-R-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
    try {
      return await Payment.create({
        subscription: subscriptionId,
        student: ledger.subscription.student,
        amountPaise: input.amountPaise,
        method: input.method,
        receiptRef,
        idempotencyKey: input.idempotencyKey,
        recordedBy: new Types.ObjectId(input.operatorId),
        receivedAt: new Date(),
        status: "received",
      });
    } catch (error: unknown) {
      if (isDuplicateKeyError(error)) {
        const retried = await Payment.findOne({ idempotencyKey: input.idempotencyKey }).lean();
        if (retried) return retried;
      }
      throw error;
    }
  } finally {
    await releasePaymentLock(subscriptionId, lockToken);
  }
}

export async function reversePayment(
  paymentId: string,
  operatorId: string,
  reason: string,
) {
  await connectDB();
  if (!Types.ObjectId.isValid(paymentId) || !Types.ObjectId.isValid(operatorId)) {
    throw new ApiError({ status: 400, code: "INVALID_ID", message: "A supplied identifier is invalid" });
  }
  const payment = await Payment.findOneAndUpdate(
    { _id: paymentId, status: "received" },
    {
      $set: {
        status: "reversed",
        reversedAt: new Date(),
        reversedBy: new Types.ObjectId(operatorId),
        reversalReason: reason.trim(),
      },
    },
    { returnDocument: "after", runValidators: true },
  ).lean();

  if (!payment) {
    throw new ApiError({ status: 404, code: "PAYMENT_NOT_FOUND", message: "Received payment was not found" });
  }
  return payment;
}

export async function listExpenses(from?: string, to?: string) {
  await connectDB();
  const filter: { expenseDate?: { $gte?: Date; $lt?: Date } } = {};
  if (from || to) {
    filter.expenseDate = {};
    if (from) filter.expenseDate.$gte = parseServiceDate(from).date;
    if (to) {
      filter.expenseDate.$lt = new Date(parseServiceDate(to).date.getTime() + 86_400_000);
    }
  }

  return Expense.find(filter).sort({ expenseDate: -1, createdAt: -1 }).lean();
}

export async function recordExpense(input: {
  category: ExpenseCategory;
  amountPaise: number;
  expenseDate: string;
  description: string;
  paymentMethod?: PaymentMethod;
  reference?: string;
  idempotencyKey: string;
  operatorId: string;
}) {
  await connectDB();
  if (!Types.ObjectId.isValid(input.operatorId)) {
    throw new ApiError({ status: 400, code: "INVALID_ID", message: "Operator identifier is invalid" });
  }
  const expenseDate = parseServiceDate(input.expenseDate).date;
  const paymentMethod = input.paymentMethod ?? "cash";
  const reference = input.reference?.trim() || undefined;
  const prior = await Expense.findOne({ idempotencyKey: input.idempotencyKey }).lean();
  if (prior) {
    if (
      prior.category !== input.category ||
      prior.amountPaise !== input.amountPaise ||
      prior.description !== input.description ||
      prior.expenseDate.getTime() !== expenseDate.getTime() ||
      prior.paymentMethod !== paymentMethod ||
      prior.reference !== reference
    ) {
      throw new ApiError({ status: 409, code: "IDEMPOTENCY_KEY_REUSED", message: "Expense request key was already used for different details" });
    }
    return prior;
  }

  try {
    return await Expense.create({
      category: input.category,
      amountPaise: input.amountPaise,
      expenseDate,
      description: input.description,
      paymentMethod,
      reference,
      idempotencyKey: input.idempotencyKey,
      recordedBy: new Types.ObjectId(input.operatorId),
      status: "recorded",
    });
  } catch (error: unknown) {
    if (isDuplicateKeyError(error)) {
      const retry = await Expense.findOne({ idempotencyKey: input.idempotencyKey }).lean();
      if (retry) return retry;
    }
    throw error;
  }
}

export async function reverseExpense(expenseId: string, operatorId: string, reason: string) {
  await connectDB();
  if (!Types.ObjectId.isValid(expenseId) || !Types.ObjectId.isValid(operatorId)) {
    throw new ApiError({ status: 400, code: "INVALID_ID", message: "A supplied identifier is invalid" });
  }
  const expense = await Expense.findOneAndUpdate(
    { _id: expenseId, status: "recorded" },
    {
      $set: {
        status: "reversed",
        reversedAt: new Date(),
        reversedBy: new Types.ObjectId(operatorId),
        reversalReason: reason.trim(),
      },
    },
    { returnDocument: "after", runValidators: true },
  ).lean();

  if (!expense) {
    throw new ApiError({ status: 404, code: "EXPENSE_NOT_FOUND", message: "Recorded expense was not found" });
  }
  return expense;
}

export async function getFinancialReport(from: string, to: string) {
  await connectDB();
  const fromDate = parseServiceDate(from).date;
  const toDate = parseServiceDate(to).date;
  if (toDate < fromDate) {
    throw new ApiError({ status: 400, code: "INVALID_REPORT_RANGE", message: "Report end date must be on or after start date" });
  }
  const toExclusive = new Date(toDate.getTime() + 86_400_000);
  const paymentRangeStart = new Date(fromDate.getTime() - INDIA_TIME_OFFSET_MS);
  const paymentRangeEnd = new Date(toExclusive.getTime() - INDIA_TIME_OFFSET_MS);

  const [subscriptions, paymentTotals, expenseTotals, paymentsByMethod, expensesByCategory] = await Promise.all([
    Subscription.find({
      status: { $in: ["active", "expired"] },
      startDate: { $lt: toExclusive },
      endDate: { $gt: fromDate },
    }).lean(),
    Payment.aggregate([
      { $match: { status: "received", receivedAt: { $gte: paymentRangeStart, $lt: paymentRangeEnd } } },
      { $group: { _id: null, totalPaise: { $sum: "$amountPaise" } } },
    ]),
    Expense.aggregate([
      { $match: { status: "recorded", expenseDate: { $gte: fromDate, $lt: toExclusive } } },
      { $group: { _id: null, totalPaise: { $sum: "$amountPaise" } } },
    ]),
    Payment.aggregate([
      { $match: { status: "received", receivedAt: { $gte: paymentRangeStart, $lt: paymentRangeEnd } } },
      { $group: { _id: "$method", totalPaise: { $sum: "$amountPaise" } } },
    ]),
    Expense.aggregate([
      { $match: { status: "recorded", expenseDate: { $gte: fromDate, $lt: toExclusive } } },
      { $group: { _id: "$category", totalPaise: { $sum: "$amountPaise" } } },
    ]),
  ]);

  const accruedChargesPaise = subscriptions.reduce(
    (total, subscription) => total + rangeSubscriptionCharge(subscription, fromDate, toExclusive),
    0,
  );
  const collectedPaise = paymentTotals[0]?.totalPaise ?? 0;
  const expensesPaise = expenseTotals[0]?.totalPaise ?? 0;

  const todayStart = new Date(`${currentIndiaDateKey()}T00:00:00.000Z`);
  const todayEndExclusive = new Date(todayStart.getTime() + 86_400_000);
  const throughTodayExclusive = todayEndExclusive < toExclusive ? todayEndExclusive : toExclusive;
  const activeSubscriptions = await Subscription.find({
    status: { $in: ["active", "expired"] },
    startDate: { $lt: throughTodayExclusive },
    endDate: { $gt: new Date(0) },
  }).lean();
  const allReceivedTotals = await Payment.aggregate([
    { $match: { status: "received" } },
    { $group: { _id: "$subscription", receivedPaise: { $sum: "$amountPaise" } } },
  ]);
  const receivedBySubscription = new Map(
    allReceivedTotals.map((item: { _id: Types.ObjectId; receivedPaise: number }) => [
      item._id.toString(),
      item.receivedPaise,
    ]),
  );
  const outstandingPaise = activeSubscriptions.reduce((total, subscription) => {
    const end = subscription.endDate < throughTodayExclusive ? subscription.endDate : throughTodayExclusive;
    const accrued = end > subscription.startDate
      ? subscriptionChargePaise({ ...subscription, endDate: end })
      : 0;
    return total + Math.max(accrued - (receivedBySubscription.get(subscription._id.toString()) ?? 0), 0);
  }, 0);

  return {
    period: { from, to },
    currency: "INR",
    moneyUnit: "paise",
    billingPolicy: "Full monthly price is charged for every calendar month touched by the exclusive subscription period; no partial-month proration.",
    accruedChargesPaise,
    collectedPaise,
    expensesPaise,
    outstandingPaise,
    netCashMovementPaise: collectedPaise - expensesPaise,
    netCashMovementLabel: "Collections minus recorded expenses; not accounting profit",
    paymentsByMethod: Object.fromEntries(paymentsByMethod.map((item: { _id: string; totalPaise: number }) => [item._id, item.totalPaise])),
    expensesByCategory: Object.fromEntries(expensesByCategory.map((item: { _id: string; totalPaise: number }) => [item._id, item.totalPaise])),
  };
}

export async function listPayableSubscriptions() {
  await connectDB();
  const subscriptions = await Subscription.find({
    status: { $in: ["active", "expired"] },
  })
    .sort({ startDate: -1 })
    .lean();
  const studentIds = [...new Set(subscriptions.map((subscription) => subscription.student.toString()))];
  const students = await import("@/models/Student").then(({ Student }) =>
    Student.find({ _id: { $in: studentIds }, role: "student" })
      .select("studentId fullName status")
      .lean(),
  );
  const studentsById = new Map(students.map((student) => [student._id.toString(), student]));
  const totals = await Payment.aggregate([
    { $match: { status: "received", subscription: { $in: subscriptions.map((item) => item._id) } } },
    { $group: { _id: "$subscription", receivedPaise: { $sum: "$amountPaise" } } },
  ]);
  const receivedById = new Map(
    totals.map((item: { _id: Types.ObjectId; receivedPaise: number }) => [
      item._id.toString(),
      item.receivedPaise,
    ]),
  );

  return subscriptions.flatMap((subscription) => {
    const student = studentsById.get(subscription.student.toString());
    if (!student) return [];
    const totalChargePaise = subscriptionChargePaise(subscription);
    const receivedPaise = receivedById.get(subscription._id.toString()) ?? 0;
    const outstandingPaise = Math.max(totalChargePaise - receivedPaise, 0);
    if (outstandingPaise === 0) return [];
    return [{ subscription, student, totalChargePaise, receivedPaise, outstandingPaise }];
  });
}
import "server-only";
import { randomUUID } from "node:crypto";
import mongoose, {
  Schema,
  Types,
  type HydratedDocument,
  type Model,
} from "mongoose";
import { Student } from "@/models/Student";

export const SUBSCRIPTION_PRICES_PAISE = {
  afternoon: 150000,
  night: 150000,
  both: 300000,
} as const;

export type SubscriptionPlan = keyof typeof SUBSCRIPTION_PRICES_PAISE;
export type SubscriptionStatus = "active" | "expired" | "cancelled";

export interface SubscriptionFields {
  student: Types.ObjectId;
  plan: SubscriptionPlan;
  startDate: Date;
  endDate: Date;
  monthlyAmountPaise: number;
  status: SubscriptionStatus;
  paymentLockToken?: string;
  paymentLockExpiresAt?: Date;
}

export interface CreateSubscriptionInput {
  student: Types.ObjectId | string;
  plan: SubscriptionPlan;
  startDate: Date;
  endDate: Date;
  status?: SubscriptionStatus;
  monthlyAmountPaise?: number;
}

type SubscriptionDocument = HydratedDocument<SubscriptionFields>;

interface SubscriptionModel extends Model<SubscriptionFields> {
  createForStudent(input: CreateSubscriptionInput): Promise<SubscriptionDocument>;
}

export class OverlappingSubscriptionError extends Error {
  constructor() {
    super("Active subscription periods for a student cannot overlap");
    this.name = "OverlappingSubscriptionError";
  }
}

function priceForPlan(plan: unknown): number {
  if (
    typeof plan !== "string" ||
    !Object.prototype.hasOwnProperty.call(SUBSCRIPTION_PRICES_PAISE, plan)
  ) {
    throw new Error("Unsupported subscription plan");
  }

  return SUBSCRIPTION_PRICES_PAISE[plan as SubscriptionPlan];
}

const subscriptionSchema = new Schema<SubscriptionFields, SubscriptionModel>(
  {
    student: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    plan: {
      type: String,
      enum: Object.keys(SUBSCRIPTION_PRICES_PAISE),
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    monthlyAmountPaise: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["active", "expired", "cancelled"],
      default: "active",
      required: true,
    },
    paymentLockToken: {
      type: String,
      select: false,
    },
    paymentLockExpiresAt: {
      type: Date,
      select: false,
    },
  },
  { timestamps: true },
);

subscriptionSchema.pre("validate", function () {
  const subscription = this as unknown as SubscriptionDocument;

  if (
    subscription.startDate instanceof Date &&
    subscription.endDate instanceof Date &&
    subscription.endDate <= subscription.startDate
  ) {
    subscription.invalidate("endDate", "endDate must be later than startDate");
  }

  if (subscription.monthlyAmountPaise !== undefined) {
    if (!Number.isSafeInteger(subscription.monthlyAmountPaise)) {
      subscription.invalidate(
        "monthlyAmountPaise",
        "monthlyAmountPaise must be a safe integer",
      );
    }

    try {
      if (
        subscription.monthlyAmountPaise !== priceForPlan(subscription.plan)
      ) {
        subscription.invalidate(
          "monthlyAmountPaise",
          "monthlyAmountPaise does not match the selected plan",
        );
      }
    } catch {
      subscription.invalidate("plan", "Unsupported subscription plan");
    }
  }
});

subscriptionSchema.index({ student: 1, status: 1, startDate: 1, endDate: 1 });
subscriptionSchema.index({ status: 1, plan: 1, startDate: 1, endDate: 1 });

subscriptionSchema.pre("save", async function () {
  const subscription = this as unknown as SubscriptionDocument;
  const needsOverlapCheck =
    subscription.status === "active" &&
    (subscription.isNew ||
      subscription.isModified("student") ||
      subscription.isModified("startDate") ||
      subscription.isModified("endDate") ||
      subscription.isModified("status"));

  if (!needsOverlapCheck) {
    return;
  }

  const lockToken = subscription.$locals.subscriptionLockToken as
    | string
    | undefined;
  if (!lockToken) {
    throw new Error("Create active subscriptions with Subscription.createForStudent");
  }

  const lockIsHeld = await Student.exists({
    _id: subscription.student,
    subscriptionLockToken: lockToken,
    subscriptionLockExpiresAt: { $gt: new Date() },
  });
  if (!lockIsHeld) {
    throw new Error("Student subscription lock expired before save");
  }

  const overlap = await Subscription.findOne({
    student: subscription.student,
    status: "active",
    startDate: { $lt: subscription.endDate },
    endDate: { $gt: subscription.startDate },
  })
    .select("_id")
    .lean();

  if (overlap) {
    throw new OverlappingSubscriptionError();
  }
});

const LOCK_LEASE_MS = 60_000;
const LOCK_WAIT_MS = 5_000;
const LOCK_RETRY_MS = 25;

async function acquireStudentLock(studentId: Types.ObjectId): Promise<string> {
  const token = randomUUID();
  const deadline = Date.now() + LOCK_WAIT_MS;

  while (Date.now() < deadline) {
    const now = new Date();
    const acquired = await Student.findOneAndUpdate(
      {
        _id: studentId,
        role: "student",
        status: "active",
        $or: [
          { subscriptionLockExpiresAt: { $exists: false } },
          { subscriptionLockExpiresAt: { $lte: now } },
        ],
      },
      {
        $set: {
          subscriptionLockToken: token,
          subscriptionLockExpiresAt: new Date(now.getTime() + LOCK_LEASE_MS),
        },
      },
      { returnDocument: "after", projection: { _id: 1 } },
    );

    if (acquired) {
      return token;
    }

    if (!(await Student.exists({ _id: studentId, role: "student", status: "active" }))) {
      throw new Error("Student not found");
    }

    await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
  }

  throw new Error("Timed out waiting for the student's subscription lock");
}

async function releaseStudentLock(
  studentId: Types.ObjectId,
  token: string,
): Promise<void> {
  await Student.updateOne(
    { _id: studentId, subscriptionLockToken: token },
    {
      $unset: {
        subscriptionLockToken: 1,
        subscriptionLockExpiresAt: 1,
      },
    },
  );
}

subscriptionSchema.static(
  "createForStudent",
  async function createForStudent(
    input: CreateSubscriptionInput,
  ): Promise<SubscriptionDocument> {
    if (!mongoose.isValidObjectId(input.student)) {
      throw new Error("A valid student id is required");
    }

    const monthlyAmountPaise = priceForPlan(input.plan);
    if (
      input.monthlyAmountPaise !== undefined &&
      input.monthlyAmountPaise !== monthlyAmountPaise
    ) {
      throw new Error("Subscription price must match the selected plan");
    }

    const studentId = new Types.ObjectId(input.student);
    const subscription = new this({
      ...input,
      student: studentId,
      monthlyAmountPaise,
    });
    await subscription.validate();

    if (subscription.status !== "active") {
      return subscription.save();
    }

    const lockToken = await acquireStudentLock(studentId);
    subscription.$locals.subscriptionLockToken = lockToken;

    try {
      return await subscription.save();
    } finally {
      await releaseStudentLock(studentId, lockToken);
    }
  },
);

export const Subscription: SubscriptionModel =
  (mongoose.models.Subscription as SubscriptionModel | undefined) ??
  mongoose.model<SubscriptionFields, SubscriptionModel>(
    "Subscription",
    subscriptionSchema,
  );
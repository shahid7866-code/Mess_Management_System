import "server-only";
import mongoose, { Schema, Types, type Model } from "mongoose";

export const EXPENSE_CATEGORIES = [
  "food_supplies",
  "groceries",
  "vegetables",
  "milk",
  "cooking_gas",
  "utilities",
  "electricity",
  "water",
  "rent",
  "maintenance",
  "staff",
  "staff_wages",
  "cleaning",
  "transport",
  "other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type ExpenseStatus = "recorded" | "reversed";
export type ExpensePaymentMethod = "cash" | "upi" | "bank_transfer" | "card";

export interface ExpenseFields {
  category: ExpenseCategory;
  amountPaise: number;
  expenseDate: Date;
  description: string;
  paymentMethod: ExpensePaymentMethod;
  reference?: string;
  idempotencyKey: string;
  recordedBy: Types.ObjectId;
  status: ExpenseStatus;
  reversedAt?: Date;
  reversedBy?: Types.ObjectId;
  reversalReason?: string;
}

const expenseSchema = new Schema<ExpenseFields>(
  {
    category: {
      type: String,
      enum: EXPENSE_CATEGORIES,
      required: true,
    },
    amountPaise: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isSafeInteger,
        message: "Expense amount must be a positive integer number of paise",
      },
    },
    expenseDate: {
      type: Date,
      required: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 500,
    },
    paymentMethod: {
      type: String,
      enum: ["cash", "upi", "bank_transfer", "card"],
      default: "cash",
      required: true,
    },
    reference: { type: String, trim: true, maxlength: 120 },
    idempotencyKey: {
      type: String,
      required: true,
      immutable: true,
    },
    recordedBy: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      immutable: true,
    },
    status: {
      type: String,
      enum: ["recorded", "reversed"],
      default: "recorded",
      required: true,
    },
    reversedAt: Date,
    reversedBy: {
      type: Schema.Types.ObjectId,
      ref: "Student",
    },
    reversalReason: {
      type: String,
      trim: true,
      maxlength: 500,
    },
  },
  { timestamps: true },
);

expenseSchema.pre("validate", function () {
  if (this.status === "reversed" && (!this.reversalReason || !this.reversedBy || !this.reversedAt)) {
    this.invalidate("reversalReason", "A reversed expense requires an operator, time, and reason");
  }
});

expenseSchema.index({ expenseDate: -1, category: 1, status: 1 });
expenseSchema.index({ idempotencyKey: 1 }, { unique: true });

export const Expense: Model<ExpenseFields> =
  (mongoose.models.Expense as Model<ExpenseFields> | undefined) ??
  mongoose.model<ExpenseFields>("Expense", expenseSchema);
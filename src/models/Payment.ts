import "server-only";
import mongoose, { Schema, Types, type Model } from "mongoose";

export type PaymentMethod = "cash" | "upi" | "bank_transfer" | "card";
export type PaymentStatus = "received" | "reversed";

export interface PaymentFields {
  subscription: Types.ObjectId;
  student: Types.ObjectId;
  amountPaise: number;
  method: PaymentMethod;
  receiptRef: string;
  idempotencyKey: string;
  receivedAt: Date;
  recordedBy: Types.ObjectId;
  status: PaymentStatus;
  reversedAt?: Date;
  reversedBy?: Types.ObjectId;
  reversalReason?: string;
}

const paymentSchema = new Schema<PaymentFields>(
  {
    subscription: {
      type: Schema.Types.ObjectId,
      ref: "Subscription",
      required: true,
    },
    student: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    amountPaise: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isSafeInteger,
        message: "Payment amount must be a positive integer number of paise",
      },
    },
    method: {
      type: String,
      enum: ["cash", "upi", "bank_transfer", "card"],
      required: true,
    },
    receiptRef: {
      type: String,
      required: true,
      immutable: true,
    },
    idempotencyKey: {
      type: String,
      required: true,
      immutable: true,
    },
    receivedAt: {
      type: Date,
      required: true,
      default: Date.now,
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
      enum: ["received", "reversed"],
      default: "received",
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

paymentSchema.pre("validate", function () {
  if (this.status === "reversed" && (!this.reversalReason || !this.reversedBy || !this.reversedAt)) {
    this.invalidate("reversalReason", "A reversed payment requires an operator, time, and reason");
  }
});

paymentSchema.index({ receiptRef: 1 }, { unique: true });
paymentSchema.index({ idempotencyKey: 1 }, { unique: true });
paymentSchema.index({ student: 1, receivedAt: -1 });
paymentSchema.index({ subscription: 1, status: 1 });

export const Payment: Model<PaymentFields> =
  (mongoose.models.Payment as Model<PaymentFields> | undefined) ??
  mongoose.model<PaymentFields>("Payment", paymentSchema);
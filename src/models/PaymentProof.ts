import "server-only";
import mongoose, { Schema, Types, type Model } from "mongoose";
import type { PaymentMethod } from "./Payment";

export type PaymentProofStatus =
  | "pending"
  | "approving"
  | "rejecting"
  | "approved"
  | "rejected";

export interface PaymentProofFields {
  student: Types.ObjectId;
  subscription: Types.ObjectId;
  amountPaise: number;
  utr: string;
  method: PaymentMethod;
  screenshot: Buffer;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  status: PaymentProofStatus;
  submittedAt: Date;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  reviewNote?: string;
  payment?: Types.ObjectId;
}

const paymentProofSchema = new Schema<PaymentProofFields>(
  {
    student: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    subscription: { type: Schema.Types.ObjectId, ref: "Subscription", required: true },
    amountPaise: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isSafeInteger,
        message: "Payment amount must be a positive integer number of paise",
      },
    },
    utr: { type: String, required: true, trim: true, uppercase: true, minlength: 6, maxlength: 32 },
    method: {
      type: String,
      enum: ["cash", "upi", "bank_transfer", "card"],
      required: true,
    },
    screenshot: { type: Buffer, required: true, select: false },
    contentType: {
      type: String,
      enum: ["image/jpeg", "image/png", "image/webp"],
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "approving", "rejecting", "approved", "rejected"],
      default: "pending",
      required: true,
    },
    submittedAt: { type: Date, required: true, default: Date.now, immutable: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "Student" },
    reviewedAt: Date,
    reviewNote: { type: String, trim: true, maxlength: 500 },
    payment: { type: Schema.Types.ObjectId, ref: "Payment" },
  },
  { timestamps: true },
);

paymentProofSchema.index({ status: 1, createdAt: -1 });
paymentProofSchema.index({ student: 1, createdAt: -1 });
paymentProofSchema.index({ subscription: 1, status: 1 });
paymentProofSchema.index({ utr: 1 }, { unique: true, partialFilterExpression: { utr: { $type: "string" } } });

export const PaymentProof: Model<PaymentProofFields> =
  (mongoose.models.PaymentProof as Model<PaymentProofFields> | undefined) ??
  mongoose.model<PaymentProofFields>("PaymentProof", paymentProofSchema);

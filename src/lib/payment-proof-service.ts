import "server-only";
import { Types } from "mongoose";
import { ApiError } from "@/lib/api-response";
import { connectDB } from "@/lib/mongodb";
import { getSubscriptionLedger, recordPayment } from "@/lib/finance-service";
import { currentIndiaDateKey } from "@/lib/meal-service";
import { PaymentProof, type PaymentProofStatus } from "@/models/PaymentProof";
import type { PaymentMethod } from "@/models/Payment";
import { Subscription } from "@/models/Subscription";
import { MessSettings } from "@/models/MessSettings";
import { readPaymentQr, removePaymentQr, storePaymentQr, type PaymentQrContentType } from "@/lib/payment-qr-storage";

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

export async function submitStudentPaymentProof(input: {
  studentId: string;
  subscriptionId: string;
  amountPaise: number;
  utr: string;
  method: PaymentMethod;
  screenshot: Buffer;
  contentType: "image/jpeg" | "image/png" | "image/webp";
}) {
  await connectDB();
  if (
    !Types.ObjectId.isValid(input.studentId) ||
    !Types.ObjectId.isValid(input.subscriptionId)
  ) {
    throw new ApiError({ status: 400, code: "INVALID_ID", message: "A supplied identifier is invalid" });
  }
  const utr = input.utr.trim().toUpperCase();
  if (!/^[A-Z0-9]{6,32}$/.test(utr)) throw new ApiError({ status: 400, code: "INVALID_UTR", message: "Enter a valid UTR or transaction reference (6–32 letters or numbers)" });
  if (await PaymentProof.exists({ utr })) throw new ApiError({ status: 409, code: "DUPLICATE_UTR", message: "This UTR has already been submitted" });
  if (
    !Number.isSafeInteger(input.amountPaise) ||
    input.amountPaise < 1 ||
    input.screenshot.length === 0 ||
    input.screenshot.length > MAX_SCREENSHOT_BYTES
  ) {
    throw new ApiError({ status: 400, code: "INVALID_PAYMENT_PROOF", message: "Payment amount or screenshot is invalid" });
  }

  const today = new Date(`${currentIndiaDateKey()}T00:00:00.000Z`);
  const subscription = await Subscription.findOne({
    _id: input.subscriptionId,
    student: input.studentId,
    status: "active",
    startDate: { $lte: today },
    endDate: { $gt: today },
  }).select("_id");
  if (!subscription) {
    throw new ApiError({ status: 404, code: "SUBSCRIPTION_NOT_FOUND", message: "An active subscription was not found" });
  }

  const ledger = await getSubscriptionLedger(subscription.id);
  if (input.amountPaise > ledger.outstandingPaise) {
    throw new ApiError({ status: 422, code: "PAYMENT_EXCEEDS_BALANCE", message: "Submitted amount exceeds the remaining subscription balance" });
  }

  return PaymentProof.create({
    student: new Types.ObjectId(input.studentId),
    subscription: subscription._id,
    amountPaise: input.amountPaise,
    utr,
    method: input.method,
    screenshot: input.screenshot,
    contentType: input.contentType,
    status: "pending",
  });
}

export async function listStudentPaymentProofs(studentId: string) {
  await connectDB();
  if (!Types.ObjectId.isValid(studentId)) {
    throw new ApiError({ status: 400, code: "INVALID_ID", message: "Student identifier is invalid" });
  }
  const proofs = await PaymentProof.find({ student: studentId })
    .select("-screenshot")
    .sort({ submittedAt: -1 })
    .limit(30)
    .lean();
  return proofs.map((proof) => ({
    id: proof._id.toString(),
    subscriptionId: proof.subscription.toString(),
    amountPaise: proof.amountPaise,
    utr: proof.utr ?? "—",
    method: proof.method,
    status: proof.status,
    submittedAt: proof.submittedAt,
    reviewNote: proof.reviewNote,
  }));
}

export async function listPendingPaymentProofs() {
  await connectDB();
  return PaymentProof.find({})
    .select("-screenshot")
    .populate("student", "studentId fullName email")
    .populate("subscription", "plan startDate endDate")
    .sort({ submittedAt: 1 })
    .limit(200)
    .lean();
}

export async function getMessUpiId() {
  await connectDB();
  const settings = await MessSettings.findOne({ key: "primary" }).select("upiId").lean();
  return settings?.upiId ?? "";
}

export async function getMessPaymentSettings() {
  await connectDB();
  const settings = await MessSettings.findOne({ key: "primary" }).select("upiId upiQrStorageKey").lean();
  return {
    upiId: settings?.upiId ?? "",
    qrUrl: settings?.upiQrStorageKey ? "/api/payment-settings/qr" : "",
  };
}

export async function saveMessPaymentSettings(input: {
  upiId: string;
  qrImage?: { bytes: Buffer; contentType: PaymentQrContentType };
  removeQr?: boolean;
}) {
  await connectDB();
  const normalized = input.upiId.trim();
  if (normalized && !/^[\w.\-]{2,256}@[\w]{2,64}$/.test(normalized)) {
    throw new ApiError({ status: 400, code: "INVALID_UPI_ID", message: "Enter a valid UPI ID" });
  }
  if (input.qrImage && input.removeQr) throw new ApiError({ status: 400, code: "INVALID_PAYMENT_SETTINGS", message: "Upload a QR image or remove the saved image, not both" });

  const existing = await MessSettings.findOne({ key: "primary" }).select("upiQrStorageKey").lean();
  const oldKey = existing?.upiQrStorageKey;
  const newKey = input.qrImage ? await storePaymentQr(input.qrImage.bytes, input.qrImage.contentType) : undefined;
  const update: Record<string, unknown> = { $set: { upiId: normalized } };
  if (newKey) (update.$set as Record<string, unknown>).upiQrStorageKey = newKey;
  else if (input.removeQr) update.$unset = { upiQrStorageKey: 1 };

  let settings;
  try {
    settings = await MessSettings.findOneAndUpdate({ key: "primary" }, update, { upsert: true, returnDocument: "after", runValidators: true }).lean();
  } catch (error: unknown) {
    await removePaymentQr(newKey);
    throw error;
  }
  if (newKey && settings?.upiQrStorageKey !== newKey) {
    await removePaymentQr(newKey);
    throw new ApiError({ status: 500, code: "PAYMENT_SETTINGS_SAVE_FAILED", message: "The QR image reference was not saved. Please retry saving payment settings." });
  }
  if (oldKey && (newKey || input.removeQr)) {
    try { await removePaymentQr(oldKey); } catch { console.error("[payment-settings] Could not remove superseded QR image"); }
  }
  return {
    upiId: settings?.upiId ?? "",
    qrUrl: settings?.upiQrStorageKey ? "/api/payment-settings/qr" : "",
  };
}

export async function getMessPaymentQrImage() {
  await connectDB();
  const settings = await MessSettings.findOne({ key: "primary" }).select("upiQrStorageKey").lean();
  if (!settings?.upiQrStorageKey) throw new ApiError({ status: 404, code: "PAYMENT_QR_NOT_FOUND", message: "Payment QR image is not configured" });
  return readPaymentQr(settings.upiQrStorageKey);
}

export async function getPaymentProofImage(proofId: string) {
  await connectDB();
  if (!Types.ObjectId.isValid(proofId)) {
    throw new ApiError({ status: 400, code: "INVALID_ID", message: "Payment proof identifier is invalid" });
  }
  const proof = await PaymentProof.findById(proofId)
    .select("+screenshot contentType")
    .exec();
  if (!proof) {
    throw new ApiError({ status: 404, code: "PAYMENT_PROOF_NOT_FOUND", message: "Payment proof was not found" });
  }
  return { screenshot: Buffer.from(proof.screenshot), contentType: proof.contentType };
}

export async function reviewPaymentProof(input: {
  proofId: string;
  decision: "paid" | "not_paid";
  operatorId: string;
  reviewNote?: string;
}) {
  await connectDB();
  if (!Types.ObjectId.isValid(input.proofId) || !Types.ObjectId.isValid(input.operatorId)) {
    throw new ApiError({ status: 400, code: "INVALID_ID", message: "A supplied identifier is invalid" });
  }

  const processingStatus: PaymentProofStatus = input.decision === "paid" ? "approving" : "rejecting";
  let proof = await PaymentProof.findOneAndUpdate(
    { _id: input.proofId, status: "pending" },
    { $set: { status: processingStatus, reviewedBy: new Types.ObjectId(input.operatorId) } },
    { returnDocument: "after" },
  ).lean();

  if (!proof) {
    proof = await PaymentProof.findById(input.proofId).lean();
    if (!proof) {
      throw new ApiError({ status: 404, code: "PAYMENT_PROOF_NOT_FOUND", message: "Payment proof was not found" });
    }
    if (proof.status !== processingStatus) {
      if (
        (input.decision === "paid" && proof.status === "approved") ||
        (input.decision === "not_paid" && proof.status === "rejected")
      ) return proof;
      throw new ApiError({ status: 409, code: "PAYMENT_PROOF_REVIEWED", message: "This payment proof is already being reviewed or has a different decision" });
    }
  }

  if (input.decision === "not_paid") {
    return PaymentProof.findOneAndUpdate(
      { _id: proof._id, status: "rejecting" },
      {
        $set: {
          status: "rejected",
          reviewedBy: new Types.ObjectId(input.operatorId),
          reviewedAt: new Date(),
          reviewNote: input.reviewNote?.trim() || undefined,
        },
      },
      { returnDocument: "after", runValidators: true },
    ).lean();
  }

  let payment;
  try {
    payment = await recordPayment({
      subscriptionId: proof.subscription.toString(),
      amountPaise: proof.amountPaise,
      method: proof.method,
      idempotencyKey: `proof:${proof._id.toString()}`,
      operatorId: input.operatorId,
    });
  } catch (error: unknown) {
    await PaymentProof.updateOne(
      { _id: proof._id, status: "approving" },
      { $set: { status: "pending" }, $unset: { reviewedBy: 1 } },
    );
    throw error;
  }

  const approved = await PaymentProof.findOneAndUpdate(
    { _id: proof._id, status: "approving" },
    {
      $set: {
        status: "approved",
        payment: payment._id,
        reviewedBy: new Types.ObjectId(input.operatorId),
        reviewedAt: new Date(),
        reviewNote: input.reviewNote?.trim() || undefined,
      },
    },
    { returnDocument: "after", runValidators: true },
  ).lean();
  if (approved) return approved;

  const completed = await PaymentProof.findById(proof._id).lean();
  if (completed?.status === "approved") return completed;
  throw new ApiError({ status: 409, code: "PAYMENT_PROOF_REVIEW_FAILED", message: "Payment was recorded but proof review did not finish; retry marking it paid" });
}

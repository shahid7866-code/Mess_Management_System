import { connection } from "next/server";
import { z } from "zod";
import { failureResponse, handleApiError, successResponse } from "@/lib/api-response";
import { requireSession } from "@/lib/auth";
import { getMessPaymentSettings, listStudentPaymentProofs, submitStudentPaymentProof } from "@/lib/payment-proof-service";

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

function isSupportedImage(bytes: Buffer, contentType: string): contentType is "image/jpeg" | "image/png" | "image/webp" {
  if (contentType === "image/png") {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  return contentType === "image/webp" && bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
}

export async function GET(): Promise<Response> {
  await connection();
  try {
    const student = await requireSession("student");
    const [proofs, paymentSettings] = await Promise.all([listStudentPaymentProofs(student.id), getMessPaymentSettings()]);
    return successResponse({ proofs, paymentSettings });
  } catch (error: unknown) {
    return handleApiError(error, "student-payment-proofs-read");
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const student = await requireSession("student");
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return failureResponse("INVALID_FORM", "Payment proof form is invalid", 400);
    }

    const parsed = z.object({
      subscriptionId: z.string().min(1),
      amountPaise: z.coerce.number().int().positive().safe(),
      method: z.literal("upi"),
      utr: z.string().trim().min(6).max(32).regex(/^[A-Za-z0-9]+$/),
    }).safeParse({
      subscriptionId: formData.get("subscriptionId"),
      amountPaise: formData.get("amountPaise"),
      method: formData.get("method"),
      utr: formData.get("utr"),
    });
    if (!parsed.success) {
      return failureResponse("INVALID_PAYMENT_PROOF", "Provide a valid amount, payment method, and subscription", 400);
    }

    const file = formData.get("screenshot");
    if (!(file instanceof File) || file.size === 0 || file.size > MAX_SCREENSHOT_BYTES) {
      return failureResponse("INVALID_SCREENSHOT", "Upload a screenshot no larger than 5 MB", 400);
    }
    const screenshot = Buffer.from(await file.arrayBuffer());
    if (!isSupportedImage(screenshot, file.type)) {
      return failureResponse("INVALID_SCREENSHOT", "Screenshot must be a valid PNG, JPEG, or WebP image", 400);
    }

    const proof = await submitStudentPaymentProof({
      studentId: student.id,
      ...parsed.data,
      screenshot,
      contentType: file.type,
    });
    return successResponse({
      proof: {
        id: proof._id.toString(),
        subscriptionId: proof.subscription.toString(),
        amountPaise: proof.amountPaise,
        utr: proof.utr,
        method: proof.method,
        status: proof.status,
        submittedAt: proof.submittedAt,
        reviewNote: proof.reviewNote,
      },
    }, 201);
  } catch (error: unknown) {
    return handleApiError(error, "student-payment-proof-create");
  }
}

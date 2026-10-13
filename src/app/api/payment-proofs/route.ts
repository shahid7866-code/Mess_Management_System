import { connection } from "next/server";
import { requireSession } from "@/lib/auth";
import { handleApiError, successResponse } from "@/lib/api-response";
import { listPendingPaymentProofs } from "@/lib/payment-proof-service";

export async function GET(): Promise<Response> {
  await connection();
  try {
    await requireSession("admin");
    return successResponse({ proofs: await listPendingPaymentProofs() });
  } catch (error: unknown) {
    return handleApiError(error, "payment-proofs-list");
  }
}
import { z } from "zod";
import { failureResponse, handleApiError, successResponse } from "@/lib/api-response";
import { requireSession } from "@/lib/auth";
import { reviewPaymentProof } from "@/lib/payment-proof-service";

interface PaymentProofRouteContext {
  params: Promise<{ id: string }>;
}

const reviewSchema = z.object({
  decision: z.enum(["paid", "not_paid"]),
  reviewNote: z.string().trim().max(500).optional(),
});

export async function PATCH(request: Request, context: PaymentProofRouteContext): Promise<Response> {
  try {
    const admin = await requireSession("admin");
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return failureResponse("INVALID_JSON", "Request body must be JSON", 400);
    }
    const parsed = reviewSchema.safeParse(body);
    if (!parsed.success) {
      return failureResponse("INVALID_REVIEW", "Payment proof review details are invalid", 400);
    }
    const { id } = await context.params;
    const proof = await reviewPaymentProof({
      proofId: id,
      operatorId: admin.id,
      ...parsed.data,
    });
    return successResponse({ proof });
  } catch (error: unknown) {
    return handleApiError(error, "payment-proof-review");
  }
}
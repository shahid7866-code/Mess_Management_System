import { failureResponse, handleApiError, successResponse } from "@/lib/api-response";
import { requireSession } from "@/lib/auth";
import { reversePayment } from "@/lib/finance-service";

interface PaymentReverseContext {
  params: Promise<{ id: string }>;
}

export async function POST(
  request: Request,
  context: PaymentReverseContext,
): Promise<Response> {
  try {
    const operator = await requireSession("admin");
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return failureResponse("INVALID_JSON", "Request body must be JSON", 400);
    }
    if (
      typeof body !== "object" ||
      body === null ||
      !("reason" in body) ||
      typeof body.reason !== "string" ||
      body.reason.trim().length < 8 ||
      body.reason.length > 500
    ) {
      return failureResponse("INVALID_REVERSAL", "A reversal reason of at least 8 characters is required", 400);
    }

    const { id } = await context.params;
    return successResponse({
      payment: await reversePayment(id, operator.id, body.reason),
    });
  } catch (error: unknown) {
    return handleApiError(error, "payment-reverse");
  }
}
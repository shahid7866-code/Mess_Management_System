import { connection } from "next/server";
import { z } from "zod";
import { failureResponse, handleApiError, successResponse } from "@/lib/api-response";
import { requireSession } from "@/lib/auth";
import {
  getSubscriptionLedger,
  recordPayment,
} from "@/lib/finance-service";

interface PaymentRouteContext {
  params: Promise<{ id: string }>;
}

const paymentSchema = z.object({
  amountPaise: z.number().int().positive().safe(),
  method: z.enum(["cash", "upi", "bank_transfer", "card"]),
});

const idempotencyKeySchema = z.string().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/);

export async function GET(
  _request: Request,
  context: PaymentRouteContext,
): Promise<Response> {
  await connection();
  try {
    await requireSession("admin");
    const { id } = await context.params;
    return successResponse(await getSubscriptionLedger(id));
  } catch (error: unknown) {
    return handleApiError(error, "subscription-payments-read");
  }
}

export async function POST(
  request: Request,
  context: PaymentRouteContext,
): Promise<Response> {
  try {
    const operator = await requireSession("admin");
    const idempotencyKey = idempotencyKeySchema.safeParse(
      request.headers.get("Idempotency-Key"),
    );
    if (!idempotencyKey.success) {
      return failureResponse("IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key header is required", 400);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return failureResponse("INVALID_JSON", "Request body must be JSON", 400);
    }
    const parsed = paymentSchema.safeParse(body);
    if (!parsed.success) {
      return failureResponse("INVALID_PAYMENT", "Payment details are invalid", 400);
    }

    const { id } = await context.params;
    return successResponse({
      payment: await recordPayment({
        subscriptionId: id,
        ...parsed.data,
        idempotencyKey: idempotencyKey.data,
        operatorId: operator.id,
      }),
    }, 201);
  } catch (error: unknown) {
    return handleApiError(error, "subscription-payment-create");
  }
}
import { connection } from "next/server";
import { z } from "zod";
import { failureResponse, handleApiError, successResponse } from "@/lib/api-response";
import { requireSession } from "@/lib/auth";
import { ApiError } from "@/lib/api-response";
import {
  OverlappingSubscriptionError,
  Subscription,
} from "@/models/Subscription";

interface SubscriptionRouteContext {
  params: Promise<{ id: string }>;
}

const serviceDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  });

const createSubscriptionSchema = z.object({
  plan: z.enum(["afternoon", "night", "both"]),
  startDate: serviceDateSchema,
  endDate: serviceDateSchema,
});

export async function GET(
  _request: Request,
  context: SubscriptionRouteContext,
): Promise<Response> {
  await connection();

  try {
    await requireSession("admin");
    const { id } = await context.params;
    const subscriptions = await Subscription.find({ student: id })
      .sort({ startDate: -1 })
      .lean();
    return successResponse({ subscriptions });
  } catch (error: unknown) {
    return handleApiError(error, "student-subscriptions-list");
  }
}

export async function POST(
  request: Request,
  context: SubscriptionRouteContext,
): Promise<Response> {
  try {
    await requireSession("admin");
    const { id } = await context.params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return failureResponse("INVALID_JSON", "Request body must be JSON", 400);
    }

    const parsed = createSubscriptionSchema.safeParse(body);
    if (!parsed.success) {
      return failureResponse("INVALID_SUBSCRIPTION", "Subscription details are invalid", 400);
    }

    const subscription = await Subscription.createForStudent({
      student: id,
      plan: parsed.data.plan,
      startDate: new Date(`${parsed.data.startDate}T00:00:00.000Z`),
      endDate: new Date(`${parsed.data.endDate}T00:00:00.000Z`),
    });
    return successResponse({ subscription }, 201);
  } catch (error: unknown) {
    if (error instanceof OverlappingSubscriptionError) {
      return handleApiError(
        new ApiError({
          status: 409,
          code: "SUBSCRIPTION_PERIOD_OVERLAP",
          message: "This student already has an active subscription for those dates",
        }),
        "student-subscription-create",
      );
    }
    if (error instanceof Error && error.message === "Student not found") {
      return handleApiError(
        new ApiError({
          status: 404,
          code: "STUDENT_NOT_FOUND",
          message: "Student was not found",
        }),
        "student-subscription-create",
      );
    }
    return handleApiError(error, "student-subscription-create");
  }
}
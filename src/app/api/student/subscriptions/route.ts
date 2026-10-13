import { z } from "zod";
import { failureResponse, handleApiError, successResponse } from "@/lib/api-response";
import { requireSession } from "@/lib/auth";
import { createStudentSubscription } from "@/lib/portal-service";

const startDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
});

const enrollmentSchema = z.object({
  plan: z.enum(["afternoon", "night", "both"]),
  months: z.number().int().min(1).max(12),
  startDate: startDateSchema,
});

export async function POST(request: Request): Promise<Response> {
  try {
    const student = await requireSession("student");
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return failureResponse("INVALID_JSON", "Request body must be JSON", 400);
    }

    const parsed = enrollmentSchema.safeParse(body);
    if (!parsed.success) {
      return failureResponse("INVALID_SUBSCRIPTION", "Subscription details are invalid", 400);
    }

    const subscription = await createStudentSubscription({
      studentId: student.id,
      ...parsed.data,
    });
    return successResponse({
      subscription: {
        id: subscription._id.toString(),
        plan: subscription.plan,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        monthlyAmountPaise: subscription.monthlyAmountPaise,
        status: subscription.status,
      },
    }, 201);
  } catch (error: unknown) {
    return handleApiError(error, "student-subscription-create");
  }
}
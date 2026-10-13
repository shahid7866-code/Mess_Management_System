import { connection } from "next/server";
import { z } from "zod";
import { failureResponse, handleApiError, successResponse } from "@/lib/api-response";
import { requireSession } from "@/lib/auth";
import { getMealSchedules, updateMealSchedule } from "@/lib/meal-service";

const scheduleSchema = z.object({
  meal: z.enum(["afternoon", "night"]),
  openingTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  closingTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
}).refine((value) => value.closingTime > value.openingTime);

export async function GET(): Promise<Response> {
  await connection();
  try {
    await requireSession("admin");
    return successResponse({ schedules: await getMealSchedules() });
  } catch (error: unknown) {
    return handleApiError(error, "meal-schedules-read");
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const operator = await requireSession("admin");
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return failureResponse("INVALID_JSON", "Request body must be JSON", 400);
    }

    const parsed = scheduleSchema.safeParse(body);
    if (!parsed.success) {
      return failureResponse("INVALID_SCHEDULE", "Meal schedule is invalid", 400);
    }

    return successResponse({
      schedule: await updateMealSchedule(
        parsed.data.meal,
        parsed.data.openingTime,
        parsed.data.closingTime,
        operator.id,
      ),
    });
  } catch (error: unknown) {
    return handleApiError(error, "meal-schedules-update");
  }
}
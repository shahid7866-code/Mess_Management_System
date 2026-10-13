import { connection } from "next/server";
import { z } from "zod";
import { failureResponse, handleApiError, successResponse } from "@/lib/api-response";
import { requireSession } from "@/lib/auth";
import {
  getAttendanceSession,
  markAttendance,
} from "@/lib/meal-service";

const serviceDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  });

const mealSchema = z.enum(["afternoon", "night"]);

const attendanceSchema = z.object({
  studentId: z.string().min(1),
  serviceDate: serviceDateSchema,
  meal: mealSchema,
  status: z.enum(["present", "absent", "on_leave", "not_marked"]),
  correctionReason: z.string().trim().max(500).optional(),
});

export async function GET(request: Request): Promise<Response> {
  await connection();

  try {
    await requireSession("admin");
    const searchParams = new URL(request.url).searchParams;
    const parsed = z
      .object({ date: serviceDateSchema, meal: mealSchema })
      .safeParse({
        date: searchParams.get("date"),
        meal: searchParams.get("meal"),
      });
    if (!parsed.success) {
      return failureResponse("INVALID_QUERY", "A valid date and meal are required", 400);
    }

    return successResponse(
      await getAttendanceSession(parsed.data.date, parsed.data.meal),
    );
  } catch (error: unknown) {
    return handleApiError(error, "attendance-read");
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const operator = await requireSession("admin");
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return failureResponse("INVALID_JSON", "Request body must be JSON", 400);
    }

    const parsed = attendanceSchema.safeParse(body);
    if (!parsed.success) {
      return failureResponse("INVALID_ATTENDANCE", "Attendance details are invalid", 400);
    }

    return successResponse({
      attendance: await markAttendance({
        ...parsed.data,
        operatorId: operator.id,
      }),
    });
  } catch (error: unknown) {
    return handleApiError(error, "attendance-write");
  }
}
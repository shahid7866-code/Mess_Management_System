import { connection } from "next/server";
import { z } from "zod";
import { failureResponse, handleApiError, successResponse } from "@/lib/api-response";
import { requireSession } from "@/lib/auth";
import { createHoliday, listHolidays } from "@/lib/meal-service";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  });

const holidaySchema = z.object({
  serviceDate: dateSchema,
  reason: z.string().trim().min(2).max(240),
  attendanceExceptionAllowed: z.boolean().default(false),
  exceptionReason: z.string().trim().min(8).max(240).optional(),
}).refine(
  (value) => !value.attendanceExceptionAllowed || Boolean(value.exceptionReason),
);

export async function GET(request: Request): Promise<Response> {
  await connection();
  try {
    await requireSession();
    const searchParams = new URL(request.url).searchParams;
    return successResponse({
      holidays: await listHolidays(
        searchParams.get("from") ?? undefined,
        searchParams.get("to") ?? undefined,
      ),
    });
  } catch (error: unknown) {
    return handleApiError(error, "holidays-read");
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

    const parsed = holidaySchema.safeParse(body);
    if (!parsed.success) {
      return failureResponse("INVALID_HOLIDAY", "Holiday details are invalid", 400);
    }

    return successResponse({
      holiday: await createHoliday({ ...parsed.data, operatorId: operator.id }),
    }, 201);
  } catch (error: unknown) {
    return handleApiError(error, "holidays-create");
  }
}
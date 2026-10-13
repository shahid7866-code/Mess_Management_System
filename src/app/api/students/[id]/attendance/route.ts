import { connection } from "next/server";
import { z } from "zod";
import { handleApiError, successResponse } from "@/lib/api-response";
import { requireSession } from "@/lib/auth";
import { Attendance } from "@/models/Attendance";

interface AttendanceRouteContext {
  params: Promise<{ id: string }>;
}

const monthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/)
  .refine((value) => {
    const month = Number(value.slice(5, 7));
    return month >= 1 && month <= 12;
  });

export async function GET(
  request: Request,
  context: AttendanceRouteContext,
): Promise<Response> {
  await connection();

  try {
    await requireSession("admin");
    const { id } = await context.params;
    const parsedMonth = monthSchema.safeParse(new URL(request.url).searchParams.get("month"));
    if (!parsedMonth.success) {
      return Response.json(
        { ok: false, error: { code: "INVALID_QUERY", message: "A valid attendance month is required" } },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    const month = parsedMonth.data;
    const [year, monthNumber] = month.split("-").map(Number);
    const start = new Date(Date.UTC(year, monthNumber - 1, 1));
    const end = new Date(Date.UTC(year, monthNumber, 1));
    const records = await Attendance.find({
      student: id,
      serviceDate: { $gte: start, $lt: end },
    }).sort({ serviceDate: 1, meal: 1 }).lean();

    return successResponse({
      attendance: records.map((record) => ({
        date: new Date(record.serviceDate).toISOString().slice(0, 10),
        meal: record.meal,
        status: record.status,
        markedAt: record.markedAt,
        note: record.correctionReason,
      })),
    });
  } catch (error: unknown) {
    return handleApiError(error, "student-attendance-history");
  }
}

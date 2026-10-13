import { z } from "zod";
import { failureResponse, handleApiError, successResponse } from "@/lib/api-response";
import { requireSession } from "@/lib/auth";
import { markStudentAttendance } from "@/lib/meal-service";

const selfAttendanceSchema = z.object({
  meal: z.enum(["afternoon", "night"]),
  status: z.enum(["present", "absent"]),
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

    const parsed = selfAttendanceSchema.safeParse(body);
    if (!parsed.success) {
      return failureResponse("INVALID_ATTENDANCE", "Attendance details are invalid", 400);
    }

    const attendance = await markStudentAttendance({
      studentId: student.id,
      ...parsed.data,
    });

    return successResponse({
      attendance: {
        id: attendance._id.toString(),
        serviceDate: attendance.serviceDate.toISOString().slice(0, 10),
        meal: attendance.meal,
        status: attendance.status,
        markedAt: attendance.markedAt,
      },
    });
  } catch (error: unknown) {
    return handleApiError(error, "student-attendance-write");
  }
}
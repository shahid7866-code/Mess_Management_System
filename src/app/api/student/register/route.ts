import { z } from "zod";
import { createStudentAccount } from "@/lib/student-service";
import { handleApiError, successResponse, failureResponse } from "@/lib/api-response";

const registerSchema = z.object({
  studentId: z.string().trim().min(1).max(32),
  fullName: z.string().trim().min(1).max(120),
  email: z.union([z.email().max(254), z.literal("")]).optional(),
  phone: z.union([z.string().regex(/^\+?[1-9]\d{7,14}$/), z.literal("")]).optional(),
  password: z.string().min(12).max(72),
  confirmPassword: z.string().min(12).max(72),
});

export async function POST(request: Request): Promise<Response> {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return failureResponse("INVALID_JSON", "Request body must be JSON", 400);
    }

    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return failureResponse("INVALID_STUDENT", "Student registration details are invalid", 400);
    }

    const { confirmPassword, ...studentData } = parsed.data;
    if (studentData.password !== confirmPassword) {
      return failureResponse("PASSWORD_MISMATCH", "The password confirmation does not match", 400);
    }

    const created = await createStudentAccount({
      studentId: studentData.studentId,
      fullName: studentData.fullName,
      email: studentData.email || undefined,
      phone: studentData.phone || undefined,
      password: studentData.password,
    });

    return successResponse(
      {
        studentId: created.studentId,
        fullName: created.fullName,
      },
      201,
    );
  } catch (error: unknown) {
    return handleApiError(error, "student-register");
  }
}

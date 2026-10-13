import { connection } from "next/server";
import { handleApiError, successResponse } from "@/lib/api-response";
import { requireSession } from "@/lib/auth";
import { getStudentPortalData } from "@/lib/portal-service";

export async function GET(): Promise<Response> {
  await connection();
  try {
    const student = await requireSession("student");
    return successResponse(await getStudentPortalData(student.id));
  } catch (error: unknown) {
    return handleApiError(error, "student-portal");
  }
}
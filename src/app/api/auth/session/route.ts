import { connection } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { handleApiError, successResponse } from "@/lib/api-response";

export async function GET(): Promise<Response> {
  await connection();

  try {
    return successResponse({ student: await getCurrentSession() });
  } catch (error: unknown) {
    return handleApiError(error, "auth-session");
  }
}
import { connection } from "next/server";
import { z } from "zod";
import { failureResponse, handleApiError, successResponse } from "@/lib/api-response";
import { requireSession } from "@/lib/auth";
import {
  getStudentById,
  updateStudentAccount,
} from "@/lib/student-service";

interface StudentRouteContext {
  params: Promise<{ id: string }>;
}

const updateStudentSchema = z
  .object({
    fullName: z.string().trim().min(1).max(120).optional(),
    email: z.union([z.email().max(254), z.literal("")]).optional(),
    phone: z.union([z.string().regex(/^\+?[1-9]\d{7,14}$/), z.literal("")]).optional(),
    status: z.enum(["active", "inactive"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0);

export async function GET(
  _request: Request,
  context: StudentRouteContext,
): Promise<Response> {
  await connection();

  try {
    await requireSession("admin");
    const { id } = await context.params;
    return successResponse({ student: await getStudentById(id) });
  } catch (error: unknown) {
    return handleApiError(error, "student-detail");
  }
}

export async function PATCH(
  request: Request,
  context: StudentRouteContext,
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

    const parsed = updateStudentSchema.safeParse(body);
    if (!parsed.success) {
      return failureResponse("INVALID_STUDENT", "Student updates are invalid", 400);
    }

    return successResponse({
      student: await updateStudentAccount(id, parsed.data),
    });
  } catch (error: unknown) {
    return handleApiError(error, "student-update");
  }
}
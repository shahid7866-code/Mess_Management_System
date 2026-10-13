import { connection } from "next/server";
import { z } from "zod";
import { handleApiError, successResponse, failureResponse } from "@/lib/api-response";
import { requireSession } from "@/lib/auth";
import {
  createStudentAccount,
  listStudents,
} from "@/lib/student-service";

const listQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const createStudentSchema = z.object({
  studentId: z.string().trim().min(1).max(32),
  fullName: z.string().trim().min(1).max(120),
  email: z.union([z.email().max(254), z.literal("")]).optional(),
  phone: z.union([z.string().regex(/^\+?[1-9]\d{7,14}$/), z.literal("")]).optional(),
  password: z
    .string()
    .min(12)
    .max(72)
    .refine((value) => Buffer.byteLength(value, "utf8") <= 72),
});

export async function GET(request: Request): Promise<Response> {
  await connection();

  try {
    await requireSession("admin");
    const searchParams = new URL(request.url).searchParams;
    const parsed = listQuerySchema.safeParse({
      search: searchParams.get("search") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) {
      return failureResponse("INVALID_QUERY", "Student filters are invalid", 400);
    }

    return successResponse(await listStudents(parsed.data));
  } catch (error: unknown) {
    return handleApiError(error, "students-list");
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    await requireSession("admin");
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return failureResponse("INVALID_JSON", "Request body must be JSON", 400);
    }

    const parsed = createStudentSchema.safeParse(body);
    if (!parsed.success) {
      return failureResponse("INVALID_STUDENT", "Student details are invalid", 400);
    }

    return successResponse(await createStudentAccount(parsed.data), 201);
  } catch (error: unknown) {
    return handleApiError(error, "students-create");
  }
}
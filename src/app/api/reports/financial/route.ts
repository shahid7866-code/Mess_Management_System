import { connection } from "next/server";
import { z } from "zod";
import { failureResponse, handleApiError, successResponse } from "@/lib/api-response";
import { requireSession } from "@/lib/auth";
import { getFinancialReport } from "@/lib/finance-service";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  });

export async function GET(request: Request): Promise<Response> {
  await connection();
  try {
    await requireSession("admin");
    const searchParams = new URL(request.url).searchParams;
    const parsed = z
      .object({ from: dateSchema, to: dateSchema })
      .safeParse({ from: searchParams.get("from"), to: searchParams.get("to") });
    if (!parsed.success) {
      return failureResponse("INVALID_REPORT_RANGE", "Valid from and to dates are required", 400);
    }

    return successResponse(await getFinancialReport(parsed.data.from, parsed.data.to));
  } catch (error: unknown) {
    return handleApiError(error, "financial-report");
  }
}
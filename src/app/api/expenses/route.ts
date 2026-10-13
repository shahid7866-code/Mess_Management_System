import { connection } from "next/server";
import { z } from "zod";
import { failureResponse, handleApiError, successResponse } from "@/lib/api-response";
import { requireSession } from "@/lib/auth";
import { EXPENSE_CATEGORIES } from "@/models/Expense";
import { listExpenses, recordExpense } from "@/lib/finance-service";

const expenseSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  amountPaise: z.number().int().positive().safe(),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().trim().min(2).max(500),
  paymentMethod: z.enum(["cash", "upi", "bank_transfer", "card"]).default("cash"),
  reference: z.string().trim().max(120).optional(),
});

const idempotencyKeySchema = z.string().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/);

export async function GET(request: Request): Promise<Response> {
  await connection();
  try {
    await requireSession("admin");
    const searchParams = new URL(request.url).searchParams;
    return successResponse({
      expenses: await listExpenses(
        searchParams.get("from") ?? undefined,
        searchParams.get("to") ?? undefined,
      ),
    });
  } catch (error: unknown) {
    return handleApiError(error, "expenses-read");
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const operator = await requireSession("admin");
    const idempotencyKey = idempotencyKeySchema.safeParse(
      request.headers.get("Idempotency-Key"),
    );
    if (!idempotencyKey.success) {
      return failureResponse("IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key header is required", 400);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return failureResponse("INVALID_JSON", "Request body must be JSON", 400);
    }
    const parsed = expenseSchema.safeParse(body);
    if (!parsed.success) {
      return failureResponse("INVALID_EXPENSE", "Expense details are invalid", 400);
    }

    return successResponse({
      expense: await recordExpense({
        ...parsed.data,
        idempotencyKey: idempotencyKey.data,
        operatorId: operator.id,
      }),
    }, 201);
  } catch (error: unknown) {
    return handleApiError(error, "expense-create");
  }
}
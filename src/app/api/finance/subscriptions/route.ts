import { connection } from "next/server";
import { handleApiError, successResponse } from "@/lib/api-response";
import { requireSession } from "@/lib/auth";
import { listPayableSubscriptions } from "@/lib/finance-service";

export async function GET(): Promise<Response> {
  await connection();
  try {
    await requireSession("admin");
    return successResponse({ subscriptions: await listPayableSubscriptions() });
  } catch (error: unknown) {
    return handleApiError(error, "finance-subscriptions");
  }
}
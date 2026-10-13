import { connection } from "next/server";
import { z } from "zod";
import { failureResponse, handleApiError, successResponse } from "@/lib/api-response";
import { requireSession } from "@/lib/auth";
import {
  currentIndiaDateKey,
  getDailyMealData,
  saveDailyMenu,
} from "@/lib/meal-service";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  });

const menuSchema = z.object({
  serviceDate: dateSchema,
  afternoonItems: z.array(z.string().trim().min(1).max(100)).max(30),
  nightItems: z.array(z.string().trim().min(1).max(100)).max(30),
});

export async function GET(request: Request): Promise<Response> {
  await connection();
  try {
    await requireSession();
    const requestedDate = new URL(request.url).searchParams.get("date") ?? currentIndiaDateKey();
    return successResponse(await getDailyMealData(requestedDate));
  } catch (error: unknown) {
    return handleApiError(error, "menus-read");
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const operator = await requireSession("admin");
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return failureResponse("INVALID_JSON", "Request body must be JSON", 400);
    }

    const parsed = menuSchema.safeParse(body);
    if (!parsed.success) {
      return failureResponse("INVALID_MENU", "Menu details are invalid", 400);
    }

    return successResponse({
      menu: await saveDailyMenu(
        parsed.data.serviceDate,
        parsed.data.afternoonItems,
        parsed.data.nightItems,
        operator.id,
      ),
    });
  } catch (error: unknown) {
    return handleApiError(error, "menus-update");
  }
}
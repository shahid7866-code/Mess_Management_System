import { z } from "zod";
import { authenticateStudent } from "@/lib/auth-service";
import { createSession, revokeSessionToken, sessionCookieName } from "@/lib/auth";
import { handleApiError, successResponse } from "@/lib/api-response";

const loginSchema = z.object({
  identifier: z.string().trim().min(1).max(160),
  password: z.string().min(1).max(72),
});

function currentSessionToken(request: Request): string | undefined {
  const name = sessionCookieName();
  const cookie = request.headers.get("cookie")?.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return cookie?.slice(name.length + 1);
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body: unknown = await request.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        {
          ok: false,
          error: {
            code: "INVALID_REQUEST",
            message: "Provide a valid identifier and password",
          },
        },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const student = await authenticateStudent(
      parsed.data.identifier,
      parsed.data.password,
    );
    // Replace the session on this shared browser so account switching does not
    // leave the previous account's server session active.
    await revokeSessionToken(currentSessionToken(request));
    const token = await createSession(student.id);
    const response = successResponse({ student });
    response.headers.append(
      "Set-Cookie",
      `${sessionCookieName()}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
    );
    return response;
  } catch (error: unknown) {
    if (error instanceof SyntaxError) {
      return Response.json(
        {
          ok: false,
          error: { code: "INVALID_JSON", message: "Request body must be JSON" },
        },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    return handleApiError(error, "auth-login");
  }
}

import { revokeCurrentSession } from "@/lib/auth";
import { handleApiError, successResponse } from "@/lib/api-response";

export async function POST(): Promise<Response> {
  try {
    await revokeCurrentSession();
    return successResponse({ loggedOut: true });
  } catch (error: unknown) {
    return handleApiError(error, "auth-logout");
  }
}
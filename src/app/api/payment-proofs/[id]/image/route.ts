import { connection } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { requireSession } from "@/lib/auth";
import { getPaymentProofImage } from "@/lib/payment-proof-service";

interface PaymentProofImageRouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: PaymentProofImageRouteContext): Promise<Response> {
  await connection();
  try {
    await requireSession("admin");
    const { id } = await context.params;
    const image = await getPaymentProofImage(id);
    return new Response(new Uint8Array(image.screenshot), {
      headers: {
        "Content-Type": image.contentType,
        "Content-Disposition": "inline",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: unknown) {
    return handleApiError(error, "payment-proof-image");
  }
}
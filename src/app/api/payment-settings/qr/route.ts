import { connection } from "next/server";
import { requireSession } from "@/lib/auth";
import { handleApiError } from "@/lib/api-response";
import { getMessPaymentQrImage } from "@/lib/payment-proof-service";

export async function GET(): Promise<Response> {
  await connection();
  try {
    await requireSession();
    const image = await getMessPaymentQrImage();
    return new Response(new Uint8Array(image.bytes), {
      headers: {
        "Content-Type": image.contentType,
        "Content-Disposition": "inline",
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error: unknown) {
    return handleApiError(error, "payment-settings-qr-read");
  }
}

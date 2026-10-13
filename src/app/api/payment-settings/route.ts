import { z } from "zod";
import { failureResponse, handleApiError, successResponse } from "@/lib/api-response";
import { requireSession } from "@/lib/auth";
import { getMessPaymentSettings, saveMessPaymentSettings } from "@/lib/payment-proof-service";

const MAX_QR_BYTES = 2 * 1024 * 1024;

function supportedQrImage(bytes: Buffer, contentType: string): contentType is "image/jpeg" | "image/png" | "image/webp" {
  if (contentType === "image/png") return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (contentType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return contentType === "image/webp" && bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
}

export async function GET(): Promise<Response> {
  try {
    await requireSession("admin");
    return successResponse(await getMessPaymentSettings());
  } catch (error: unknown) { return handleApiError(error, "payment-settings-read"); }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    await requireSession("admin");
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_QR_BYTES + 64 * 1024) return failureResponse("QR_TOO_LARGE", "QR image must be no larger than 2 MB", 413);
    let formData: FormData;
    try { formData = await request.formData(); } catch { return failureResponse("INVALID_FORM", "Payment settings form is invalid", 400); }
    const parsed = z.object({ upiId: z.string().trim().max(100), removeQr: z.enum(["true", "false"]).optional() }).safeParse({ upiId: formData.get("upiId"), removeQr: formData.get("removeQr") ?? undefined });
    if (!parsed.success) return failureResponse("INVALID_SETTINGS", "Provide a valid UPI ID", 400);
    let qrImage: { bytes: Buffer; contentType: "image/jpeg" | "image/png" | "image/webp" } | undefined;
    const file = formData.get("qrImage");
    if (file !== null) {
      if (!(file instanceof File) || file.size === 0 || file.size > MAX_QR_BYTES) return failureResponse("INVALID_QR_IMAGE", "Choose an image no larger than 2 MB", 400);
      const bytes = Buffer.from(await file.arrayBuffer());
      if (!supportedQrImage(bytes, file.type)) return failureResponse("INVALID_QR_IMAGE", "QR image must be a valid PNG, JPEG, or WebP image", 400);
      qrImage = { bytes, contentType: file.type };
    }
    return successResponse(await saveMessPaymentSettings({ upiId: parsed.data.upiId, qrImage, removeQr: parsed.data.removeQr === "true" }));
  } catch (error: unknown) { return handleApiError(error, "payment-settings-update"); }
}

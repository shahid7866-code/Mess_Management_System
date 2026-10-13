import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { ApiError } from "@/lib/api-response";

export type PaymentQrContentType = "image/jpeg" | "image/png" | "image/webp";

function storageDirectory(): string {
  const configured = process.env.PAYMENT_QR_STORAGE_DIR?.trim() || ".private-uploads/payment-qr";
  return path.isAbsolute(configured) ? configured : path.resolve(/*turbopackIgnore: true*/ process.cwd(), configured);
}

function extensionFor(contentType: PaymentQrContentType): string {
  return contentType === "image/jpeg" ? ".jpg" : contentType === "image/png" ? ".png" : ".webp";
}

function isSafeKey(key: string): boolean {
  return /^[0-9a-f-]{36}\.(?:jpg|png|webp)$/.test(key);
}

export async function storePaymentQr(bytes: Buffer, contentType: PaymentQrContentType): Promise<string> {
  const key = `${randomUUID()}${extensionFor(contentType)}`;
  const directory = storageDirectory();
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, key), bytes, { flag: "wx", mode: 0o600 });
  return key;
}

export async function readPaymentQr(key: string): Promise<{ bytes: Buffer; contentType: PaymentQrContentType }> {
  if (!isSafeKey(key)) throw new ApiError({ status: 404, code: "PAYMENT_QR_NOT_FOUND", message: "Payment QR image was not found" });
  try {
    const bytes = await readFile(path.join(storageDirectory(), key));
    const contentType: PaymentQrContentType = key.endsWith(".jpg") ? "image/jpeg" : key.endsWith(".png") ? "image/png" : "image/webp";
    return { bytes, contentType };
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new ApiError({ status: 404, code: "PAYMENT_QR_NOT_FOUND", message: "Payment QR image was not found" });
    }
    throw error;
  }
}

export async function removePaymentQr(key?: string): Promise<void> {
  if (!key || !isSafeKey(key)) return;
  try {
    await unlink(path.join(storageDirectory(), key));
  } catch (error: unknown) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
}

import { connection } from "next/server";
import { handleApiError, successResponse } from "@/lib/api-response";
import { connectDB } from "@/lib/mongodb";

export async function GET(): Promise<Response> {
  await connection();

  try {
    await connectDB();
    return successResponse({ message: "MongoDB connection successful" });
  } catch (error: unknown) {
    return handleApiError(error, "mongodb-health", "MongoDB connection failed");
  }
}
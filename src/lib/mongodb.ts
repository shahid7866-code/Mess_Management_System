import "server-only";
import mongoose from "mongoose";

interface MongooseCache {
  connection: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongooseCache: MongooseCache | undefined;
}

const cached = (globalThis.mongooseCache ??= {
  connection: null,
  promise: null,
});

export async function connectDB(): Promise<typeof mongoose> {
  if (cached.connection) {
    return cached.connection;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not defined");
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(uri, { bufferCommands: false })
      .catch((error: unknown) => {
        cached.promise = null;
        throw error;
      });
  }

  cached.connection = await cached.promise;
  return cached.connection;
}
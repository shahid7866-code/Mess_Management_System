import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, handleApiError, successResponse } from "../src/lib/api-response";
import { Student } from "../src/models/Student";

test("success responses use the shared envelope and disable caching", async () => {
  const response = successResponse({ id: "record-1" }, 201);

  assert.equal(response.status, 201);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), {
    ok: true,
    data: { id: "record-1" },
  });
});

test("application and Mongoose errors map to stable client responses", async () => {
  const forbidden = handleApiError(
    new ApiError({ status: 403, code: "FORBIDDEN", message: "Not allowed" }),
    "api-test",
  );
  assert.equal(forbidden.status, 403);
  assert.deepEqual(await forbidden.json(), {
    ok: false,
    error: { code: "FORBIDDEN", message: "Not allowed" },
  });

  const validationFailure = await new Student({})
    .validate()
    .catch((error: unknown) => error);
  const validationResponse = handleApiError(validationFailure, "api-test");
  assert.equal(validationResponse.status, 400);
  assert.deepEqual(await validationResponse.json(), {
    ok: false,
    error: { code: "VALIDATION_ERROR", message: "Request validation failed" },
  });

  const duplicateResponse = handleApiError({ code: 11000 }, "api-test");
  assert.equal(duplicateResponse.status, 409);
});

test("unexpected database errors are logged without leaking their message", async () => {
  const logged: unknown[][] = [];
  const originalConsoleError = console.error;
  console.error = (...values: unknown[]) => logged.push(values);

  try {
    const response = handleApiError(
      new Error("mongodb://user:private-secret@localhost/mess_management"),
      "api-test",
    );
    const body = await response.text();

    assert.equal(response.status, 500);
    assert.equal(body.includes("private-secret"), false);
    assert.deepEqual(logged, [["[api-test] Error"]]);
  } finally {
    console.error = originalConsoleError;
  }
});
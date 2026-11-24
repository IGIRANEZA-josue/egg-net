// POST /api/contact -> store a contact message.
//
// The form used to fake success client-side without sending anything, while
// telling the visitor "we received your message".
import { NextResponse } from "next/server";
import { db } from "@/db";
import { contactMessages } from "@/db/schema";
import { errorResponse } from "@/lib/auth";
import { withApi, readJson, ApiError } from "@/lib/api-handler";
import { contactSchema, firstIssue } from "@/lib/validation";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

export const POST = withApi(async ({ request, log }) => {
  const limit = await checkRateLimit(`contact:ip:${clientIp(request)}`, 5, 60 * 60);
  if (!limit.allowed) {
    const response = errorResponse("Too many messages. Please try again later.", 429);
    response.headers.set("retry-after", String(limit.retryAfter));
    return response;
  }

  const body = await readJson(request);
  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) return errorResponse(firstIssue(parsed.error));

  try {
    await db.insert(contactMessages).values(parsed.data);
    return NextResponse.json({ message: "Thank you. We received your message and will reply soon." }, { status: 201 });
  } catch (error) {
    log("contact insert failed", error);
    throw new ApiError("Could not send your message. Please try again.", 500);
  }
});

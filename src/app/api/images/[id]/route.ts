// GET /api/images/:id -> serve an uploaded image from the database.
// Images are immutable (a new upload = a new id), so cache them forever.
import { NextResponse } from "next/server";
import { db } from "@/db";
import { images } from "@/db/schema";
import { eq } from "drizzle-orm";
import { parseId } from "@/lib/validate";
import { errorResponse } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const imageId = parseId(id);
  if (!imageId) return errorResponse("Invalid image id.", 400);

  try {
    const [image] = await db.select().from(images).where(eq(images.id, imageId));
    if (!image) return errorResponse("Image not found.", 404);

    return new NextResponse(new Uint8Array(image.data), {
      headers: {
        "Content-Type": image.mime,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error("GET /api/images/:id failed:", err);
    return errorResponse("Could not load the image.", 503);
  }
}

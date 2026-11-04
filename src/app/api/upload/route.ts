// POST /api/upload  (ADMIN only)
// Stores the image in PostgreSQL (table "images") and returns /api/images/:id.
// This works on serverless hosts like Vercel where the filesystem is read-only
// and ephemeral. To use Cloudinary/S3 instead, swap this handler — the rest of
// the app only cares about the returned URL.
import { NextResponse } from "next/server";
import { db } from "@/db";
import { images } from "@/db/schema";
import { requireAdmin, errorResponse } from "@/lib/auth";

const MAX_BYTES = 3 * 1024 * 1024; // 3MB

// Validate by magic bytes, not the (client-controlled) MIME header.
// SVG is intentionally NOT allowed: it can carry scripts.
function sniffMime(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buf.length >= 6 && ["GIF87a", "GIF89a"].includes(buf.subarray(0, 6).toString("ascii"))) return "image/gif";
  return null;
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const formData = await request.formData();
    const file = formData.get("image");
    if (!(file instanceof File)) return errorResponse("No image file received.");
    if (file.size > MAX_BYTES) return errorResponse("Image must be smaller than 3MB.");
    if (file.size === 0) return errorResponse("The image file is empty.");

    const bytes = Buffer.from(await file.arrayBuffer());
    const mime = sniffMime(bytes);
    if (!mime) return errorResponse("Only JPEG, PNG, WebP or GIF images are allowed.");

    const [image] = await db.insert(images).values({ mime, data: bytes }).returning({ id: images.id });
    return NextResponse.json({ url: `/api/images/${image.id}` });
  } catch (err) {
    console.error("POST /api/upload failed:", err);
    return errorResponse("Upload failed.", 500);
  }
}

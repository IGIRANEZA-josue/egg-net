// POST /api/upload  (ADMIN only)
// Simple LOCAL image upload: the file is saved in public/uploads and served as /uploads/<name>.
// No external service (like Cloudinary) is needed. For production you could swap this
// function to upload to Cloudinary/S3 and return the remote URL instead.
//
// Security notes:
//  - the browser-supplied MIME type is not trusted; the file signature is checked
//  - the extension is derived from the detected type, never from the filename
//  - the name is random, so uploads cannot overwrite each other
//  - SVG is refused: it can carry script and would be served from our own origin
import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import crypto from "crypto";
import path from "path";
import { requireAdmin, errorResponse } from "@/lib/auth";
import { withApi, ApiError } from "@/lib/api-handler";

const MAX_BYTES = 3 * 1024 * 1024;

/** Magic-byte sniffing for the formats we actually want. */
function detectImageType(bytes: Uint8Array): { ext: string; mime: string } | null {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (
    b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) {
    return { ext: "png", mime: "image/png" };
  }
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    return { ext: "webp", mime: "image/webp" };
  }
  return null;
}

export const POST = withApi(async ({ request, log }) => {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse("No image file received.");
  }

  const file = formData.get("image");
  if (!(file instanceof File)) return errorResponse("No image file received.");
  if (file.size === 0) return errorResponse("The uploaded file is empty.");
  if (file.size > MAX_BYTES) return errorResponse("Image must be smaller than 3MB.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = detectImageType(bytes);
  if (!detected) return errorResponse("Please upload a JPG, PNG or WebP image.");

  try {
    const fileName = `product-${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${detected.ext}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, fileName), bytes);

    return NextResponse.json({ url: `/uploads/${fileName}` });
  } catch (error) {
    log("upload failed", error);
    throw new ApiError("Upload failed.", 500);
  }
});

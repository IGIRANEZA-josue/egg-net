// POST /api/upload  (ADMIN only)
// Simple LOCAL image upload: the file is saved in public/uploads and served as /uploads/<name>.
// No external service (like Cloudinary) is needed. For production you could swap this
// function to upload to Cloudinary/S3 and return the remote URL instead.
import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { requireAdmin, errorResponse } from "@/lib/auth";

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const formData = await request.formData();
    const file = formData.get("image");
    if (!(file instanceof File)) return errorResponse("No image file received.");
    if (!file.type.startsWith("image/")) return errorResponse("Only image files are allowed.");
    if (file.size > 3 * 1024 * 1024) return errorResponse("Image must be smaller than 3MB.");

    const ext = path.extname(file.name) || ".jpg";
    const fileName = `product-${Date.now()}${ext}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });

    const bytes = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(uploadDir, fileName), bytes);

    return NextResponse.json({ url: `/uploads/${fileName}` });
  } catch {
    return errorResponse("Upload failed.", 500);
  }
}

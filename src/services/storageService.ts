import crypto from "crypto";
import { Readable } from "stream";
import { v2 as cloudinary } from "cloudinary";
import axios from "axios";
import config from "../config";
import { createError } from "../middleware/errorHandler";

cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
  secure: true,
});

// MIME types Cloudinary can render inline in the browser
const INLINE_VIEWABLE_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/tiff",
  "image/bmp",
  "image/webp",
  "text/plain",
  "text/csv",
]);

export function computeSha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Derive a browser-viewable URL from a Cloudinary raw URL.
 * For images: use the image delivery URL.
 * For PDFs and viewable types: append fl_attachment:false to force inline display.
 * For all others: return the original download URL unchanged.
 */
export function deriveViewUrl(
  secureUrl: string,
  publicId: string,
  mimetype: string,
  cloudName: string,
): string {
  if (!INLINE_VIEWABLE_TYPES.has(mimetype)) {
    // Not browser-renderable - just return the raw URL
    return secureUrl;
  }

  // Image types: serve via Cloudinary image pipeline so they render in <img>
  if (mimetype.startsWith("image/")) {
    return `https://res.cloudinary.com/${cloudName}/image/upload/${publicId}`;
  }

  // PDF / text / csv: add fl_attachment:false so browser opens inline
  // Raw URL pattern: .../raw/upload/v.../folder/file
  return secureUrl.replace("/raw/upload/", "/raw/upload/fl_attachment:false/");
}

export async function uploadFile(
  buffer: Buffer,
  originalname: string,
  mimetype: string,
  uploaderId: string,
): Promise<{
  url: string;
  viewUrl: string;
  publicId: string;
  sha256: string;
  fileSize: number;
}> {
  const sha256 = computeSha256(buffer);

  const result = await new Promise<{ secure_url: string; public_id: string }>(
    (resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `evidrax-core/${uploaderId}`,
          resource_type: "raw",
          use_filename: true,
          unique_filename: true,
          overwrite: false,
          tags: ["evidrax_core_evidence"],
          context: { sha256, original_mimetype: mimetype },
        },
        (error, res) => {
          if (error || !res)
            return reject(
              createError(502, `Cloudinary upload failed: ${error?.message}`),
            );
          resolve(res as { secure_url: string; public_id: string });
        },
      );

      const readable = new Readable();
      readable.push(buffer);
      readable.push(null);
      readable.pipe(stream);
    },
  );

  const viewUrl = deriveViewUrl(
    result.secure_url,
    result.public_id,
    mimetype,
    config.cloudinary.cloudName ?? "",
  );

  return {
    url: result.secure_url, // canonical storage URL (for integrity checks)
    viewUrl, // browser-friendly URL
    publicId: result.public_id,
    sha256,
    fileSize: buffer.length,
  };
}

export async function recomputeHashFromUrl(fileUrl: string): Promise<string> {
  const response = await axios.get<ArrayBuffer>(fileUrl, {
    responseType: "arraybuffer",
    timeout: 30_000,
  });
  if (response.status !== 200) {
    throw createError(
      502,
      "Failed to retrieve file from storage for verification",
    );
  }
  return computeSha256(Buffer.from(response.data));
}

export async function deleteFile(publicId: string): Promise<unknown> {
  return cloudinary.uploader.destroy(publicId, { resource_type: "raw" });
}

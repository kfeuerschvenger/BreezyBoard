import fs from 'fs/promises';
import ApiError from '../utils/apiError.js';

/**
 * Multer's fileFilter can only see the mime type the client declares in the
 * multipart headers, which is attacker controlled: renaming a file and sending
 * `image/png` gets it past that check. This middleware runs after the upload
 * and reads the bytes actually on disk, so the declared type has to match the
 * real content or the file is deleted and the request rejected.
 *
 * Signatures are checked directly rather than through a dependency: the set of
 * formats accepted here is small and fixed, and the checks are a few bytes each.
 */
const SIGNATURES = [
  { type: 'png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: 'jpeg', bytes: [0xff, 0xd8, 0xff] },
  { type: 'gif', bytes: [0x47, 0x49, 0x46, 0x38] },
];

const startsWith = (buffer, bytes) => bytes.every((byte, index) => buffer[index] === byte);

/** WebP is a RIFF container: "RIFF" then four size bytes then "WEBP". */
const isWebp = buffer =>
  buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';

const detectImageType = buffer => {
  if (isWebp(buffer)) return 'webp';
  const match = SIGNATURES.find(signature => startsWith(buffer, signature.bytes));
  return match ? match.type : null;
};

const readHeader = async filePath => {
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(12);
    const { bytesRead } = await handle.read(buffer, 0, 12, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
};

const discard = async filePath => {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    // The upload is being rejected either way; a failed cleanup must not mask
    // the real reason from the caller.
    console.error('Could not remove a rejected upload:', error.message);
  }
};

/** Rejects an uploaded file whose real content is not one of the allowed images. */
export const verifyUploadedImage = async (req, _res, next) => {
  if (!req.file) {
    return next();
  }

  try {
    const header = await readHeader(req.file.path);
    const detected = detectImageType(header);

    if (!detected) {
      await discard(req.file.path);
      return next(new ApiError(400, 'That file is not a valid image.'));
    }

    req.file.detectedType = detected;
    next();
  } catch (error) {
    await discard(req.file.path);
    next(error);
  }
};

export default verifyUploadedImage;

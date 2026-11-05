/* Reads a PNG or JPEG data URL: its bytes, type and pixel size (from the file header). */

export interface ImageInfo {
  type: 'png' | 'jpeg';
  bytes: Uint8Array;
  base64: string;
  width: number;
  height: number;
}

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function pngSize(b: Uint8Array): [number, number] | null {
  if (b.length < 24 || b[0] !== 0x89 || b[1] !== 0x50) return null;
  const read = (i: number) => (b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3];
  return [read(16), read(20)];
}

function jpegSize(b: Uint8Array): [number, number] | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    const length = (b[i + 2] << 8) | b[i + 3];
    // SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC) carry the frame size.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return [(b[i + 7] << 8) | b[i + 8], (b[i + 5] << 8) | b[i + 6]];
    }
    i += 2 + length;
  }
  return null;
}

export function readImage(dataUrl: string | undefined): ImageInfo | null {
  const match = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(dataUrl ?? '');
  if (!match) return null;
  try {
    const type = match[1].toLowerCase() === 'png' ? 'png' : 'jpeg';
    const bytes = decodeBase64(match[2]);
    const size = type === 'png' ? pngSize(bytes) : jpegSize(bytes);
    if (!size || size[0] <= 0 || size[1] <= 0) return null;
    return { type, bytes, base64: match[2], width: size[0], height: size[1] };
  } catch {
    return null;
  }
}

/** Width and height that fit in a box, keeping the proportions. */
export function fitInBox(width: number, height: number, maxWidth: number, maxHeight: number): { width: number; height: number } {
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

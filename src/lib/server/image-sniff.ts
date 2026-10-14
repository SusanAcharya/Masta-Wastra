import "server-only";

// Step 6 of 7.3: trust the bytes, not a declared type. Reads only container headers, so no
// image library and no decode of the pixels.

export interface SniffResult {
  mime: "image/webp" | "image/jpeg";
  width: number;
  height: number;
}

export function sniffImage(bytes: Uint8Array): SniffResult | null {
  return sniffWebp(bytes) ?? sniffJpeg(bytes);
}

const ascii = (b: Uint8Array, at: number, s: string) =>
  b.length >= at + s.length && [...s].every((c, i) => b[at + i] === c.charCodeAt(0));
const u16le = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8);
const u24le = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8) | (b[at + 2] << 16);
const u16be = (b: Uint8Array, at: number) => (b[at] << 8) | b[at + 1];

function sniffWebp(b: Uint8Array): SniffResult | null {
  if (!ascii(b, 0, "RIFF") || !ascii(b, 8, "WEBP")) return null;
  let width = 0;
  let height = 0;
  if (ascii(b, 12, "VP8 ")) {
    // Lossy: 3 byte frame tag, then start code 9d 01 2a, then 14 bit width and height.
    if (b.length < 30 || b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    width = u16le(b, 26) & 0x3fff;
    height = u16le(b, 28) & 0x3fff;
  } else if (ascii(b, 12, "VP8L")) {
    // Lossless: signature 0x2f, then width-1 and height-1 as 14 bit fields.
    if (b.length < 25 || b[20] !== 0x2f) return null;
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    width = (bits & 0x3fff) + 1;
    height = ((bits >>> 14) & 0x3fff) + 1;
  } else if (ascii(b, 12, "VP8X")) {
    // Extended (alpha, animation): 24 bit canvas width-1 and height-1.
    if (b.length < 30) return null;
    width = u24le(b, 24) + 1;
    height = u24le(b, 27) + 1;
  } else {
    return null;
  }
  return width > 0 && height > 0 ? { mime: "image/webp", width, height } : null;
}

// Start of frame markers carry the size. C4 (DHT), C8 (JPG) and CC (DAC) share the range
// but are not frames.
const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function sniffJpeg(b: Uint8Array): SniffResult | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2; // markers without a length
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // end of image or scan before any frame
    const len = u16be(b, i + 2);
    if (len < 2) return null;
    if (SOF.has(marker)) {
      if (i + 9 > b.length) return null;
      const height = u16be(b, i + 5);
      const width = u16be(b, i + 7);
      return width > 0 && height > 0 ? { mime: "image/jpeg", width, height } : null;
    }
    i += 2 + len;
  }
  return null;
}

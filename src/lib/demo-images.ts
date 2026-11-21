import zlib from "node:zlib";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  const combined = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(combined), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

export interface DemoSceneSpec {
  topRgb: [number, number, number];
  bottomRgb: [number, number, number];
  accentRgb: [number, number, number];
  sunXRatio: number;
  sunYRatio: number;
  horizonRatio: number;
}

/**
 * Generates a valid RGB PNG image in pure Node.js without external image libraries.
 */
export function generateScenePng(
  width: number,
  height: number,
  scene: DemoSceneSpec,
): Buffer {
  const rowSize = 1 + width * 3;
  const raw = Buffer.alloc(rowSize * height);
  const sunX = width * scene.sunXRatio;
  const sunY = height * scene.sunYRatio;
  const sunRadius = Math.min(width, height) * 0.16;
  const horizonY = height * scene.horizonRatio;

  for (let y = 0; y < height; y++) {
    const rowStart = y * rowSize;
    raw[rowStart] = 0; // filter type None
    const t = y / Math.max(1, height - 1);

    for (let x = 0; x < width; x++) {
      const px = rowStart + 1 + x * 3;
      let r = scene.topRgb[0] + (scene.bottomRgb[0] - scene.topRgb[0]) * t;
      let g = scene.topRgb[1] + (scene.bottomRgb[1] - scene.topRgb[1]) * t;
      let b = scene.topRgb[2] + (scene.bottomRgb[2] - scene.topRgb[2]) * t;

      // Soft glowing sun / lantern accent
      const dx = x - sunX;
      const dy = y - sunY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < sunRadius * 2.1) {
        const glow = Math.max(0, 1 - dist / (sunRadius * 2.1));
        const mix = dist < sunRadius ? 0.85 : glow * 0.45;
        r = r * (1 - mix) + scene.accentRgb[0] * mix;
        g = g * (1 - mix) + scene.accentRgb[1] * mix;
        b = b * (1 - mix) + scene.accentRgb[2] * mix;
      }

      // Gentle silhouette ridge near the horizon
      const wave =
        Math.sin(x * 0.018) * (height * 0.04) + Math.cos(x * 0.043) * (height * 0.02);
      if (y > horizonY + wave) {
        const depth = Math.min(1, (y - (horizonY + wave)) / (height * 0.25));
        const darkFactor = 0.35 + depth * 0.25;
        r *= 1 - darkFactor;
        g *= 1 - darkFactor;
        b *= 1 - darkFactor;
      }

      raw[px] = Math.max(0, Math.min(255, Math.round(r)));
      raw[px + 1] = Math.max(0, Math.min(255, Math.round(g)));
      raw[px + 2] = Math.max(0, Math.min(255, Math.round(b)));
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB color type
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const idat = zlib.deflateSync(raw, { level: 6 });

  return Buffer.concat([
    signature,
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", idat),
    makeChunk("IEND", Buffer.alloc(0)),
  ]);
}

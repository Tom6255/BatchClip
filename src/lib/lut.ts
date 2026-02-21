export type ParsedCubeLut = {
  size: number;
  domainMin: [number, number, number];
  domainMax: [number, number, number];
  data: Float32Array;
};

type PackedCubeLutTexture = {
  size: number;
  width: number;
  height: number;
  domainMin: [number, number, number];
  domainMax: [number, number, number];
  data: Uint8Array;
};

const DEFAULT_DOMAIN_MIN: [number, number, number] = [0, 0, 0];
const DEFAULT_DOMAIN_MAX: [number, number, number] = [1, 1, 1];

const toFiniteNumber = (value: string): number | null => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return numeric;
};

const clamp01 = (value: number): number => {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
};

export const parseCubeLut = (content: string): ParsedCubeLut => {
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('LUT file is empty.');
  }

  let size: number | null = null;
  let domainMin: [number, number, number] = [...DEFAULT_DOMAIN_MIN];
  let domainMax: [number, number, number] = [...DEFAULT_DOMAIN_MAX];
  const values: number[] = [];

  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.split('#', 1)[0].trim();
    if (!line) {
      continue;
    }

    const parts = line.split(/\s+/);
    if (parts.length === 0) {
      continue;
    }

    const keyword = parts[0].toUpperCase();
    if (keyword === 'TITLE') {
      continue;
    }

    if (keyword === 'LUT_3D_SIZE') {
      if (parts.length < 2) {
        throw new Error('Invalid LUT_3D_SIZE declaration.');
      }

      const parsedSize = Number(parts[1]);
      if (!Number.isInteger(parsedSize) || parsedSize < 2 || parsedSize > 128) {
        throw new Error('Unsupported LUT_3D_SIZE.');
      }

      size = parsedSize;
      continue;
    }

    if (keyword === 'DOMAIN_MIN' || keyword === 'DOMAIN_MAX') {
      if (parts.length < 4) {
        throw new Error(`Invalid ${keyword} declaration.`);
      }

      const parsed = [
        toFiniteNumber(parts[1]),
        toFiniteNumber(parts[2]),
        toFiniteNumber(parts[3])
      ];

      if (parsed.some((value) => value === null)) {
        throw new Error(`Invalid ${keyword} values.`);
      }

      if (keyword === 'DOMAIN_MIN') {
        domainMin = [parsed[0]!, parsed[1]!, parsed[2]!];
      } else {
        domainMax = [parsed[0]!, parsed[1]!, parsed[2]!];
      }
      continue;
    }

    if (parts.length < 3) {
      continue;
    }

    const r = toFiniteNumber(parts[0]);
    const g = toFiniteNumber(parts[1]);
    const b = toFiniteNumber(parts[2]);
    if (r === null || g === null || b === null) {
      continue;
    }

    values.push(clamp01(r), clamp01(g), clamp01(b));
  }

  if (!size) {
    throw new Error('Missing LUT_3D_SIZE.');
  }

  const expectedValueCount = size * size * size * 3;
  if (values.length !== expectedValueCount) {
    throw new Error(`Invalid LUT data length. Expected ${expectedValueCount / 3} entries, got ${values.length / 3}.`);
  }

  return {
    size,
    domainMin,
    domainMax,
    data: new Float32Array(values)
  };
};

export const packCubeLutToTexture = (lut: ParsedCubeLut): PackedCubeLutTexture => {
  const size = lut.size;
  const width = size * size;
  const height = size;
  const packed = new Uint8Array(width * height * 4);
  const source = lut.data;

  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const sourceIndex = ((b * size + g) * size + r) * 3;
        const x = b * size + r;
        const y = g;
        const destIndex = (y * width + x) * 4;

        packed[destIndex] = Math.round(clamp01(source[sourceIndex]) * 255);
        packed[destIndex + 1] = Math.round(clamp01(source[sourceIndex + 1]) * 255);
        packed[destIndex + 2] = Math.round(clamp01(source[sourceIndex + 2]) * 255);
        packed[destIndex + 3] = 255;
      }
    }
  }

  return {
    size,
    width,
    height,
    domainMin: lut.domainMin,
    domainMax: lut.domainMax,
    data: packed
  };
};

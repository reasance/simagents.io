/**
 * The world drawn as an 8-bit game: 16 px cells, 8 × 8 sprites at two world
 * pixels per sprite pixel, four biome tile sets and a fixed palette. Sprites
 * and terrain are rendered once to offscreen canvases and then copied with
 * smoothing off, so they stay crisp at any zoom.
 */

export const TILE = 16;
export const GRID = 100;
export const FIELD = TILE * GRID;

export const INK = {
  night: '#0e0c1f', panel: '#18153a', rule: '#433a7a', ruleStrong: '#7468be', mist: '#aea8de',
  star: '#f5f2ff', gold: '#ffc93c', goldDark: '#b8831c', ok: '#5fe08a', alert: '#ff6b6b',
};
export const RESOURCE_COLORS: Record<string, string> = { food: '#ff5d5d', energy: '#4de1ff', material: '#c49a6c' };
export const HEAT_RAMP = ['#2b1a4a', '#5a1f5e', '#a8325a', '#e8643a', '#ffc93c'];

/** Biome quadrants, as the engine lays them out. */
export const BIOMES: Array<{ key: 'Forest' | 'Tundra' | 'Desert' | 'Plains'; x: number; y: number; base: string; alt: string; detail: string; label: string }> = [
  { key: 'Forest', x: 0, y: 0, base: '#1d4429', alt: '#214c2e', detail: '#3b7d47', label: '#8fe0a0' },
  { key: 'Tundra', x: 50, y: 0, base: '#283f62', alt: '#2c456b', detail: '#9cc2ea', label: '#b8d8ff' },
  { key: 'Desert', x: 0, y: 50, base: '#5c3620', alt: '#653c24', detail: '#a8743f', label: '#ffbf8a' },
  { key: 'Plains', x: 50, y: 50, base: '#43431b', alt: '#4b4b1f', detail: '#86862f', label: '#e6e68a' },
];

type Sprite = { rows: string[]; colors: Record<string, string> };
const K = INK.night;

/** Eight rows of eight; '.' is transparent and 'c' takes the tint. */
export const SPRITES = {
  agent: { rows: ['..kkkk..', '.kcccck.', 'kcwccwck', 'kckcckck', 'kcccccck', '.kcccck.', '.kc..ck.', '.kk..kk.'], colors: { k: K, w: '#ffffff' } },
  grave: { rows: ['..kkkk..', '.kggggk.', 'kggkkggk', 'kgkkkkgk', 'kggkkggk', 'kggkkggk', 'kggggggk', 'kkkkkkkk'], colors: { k: K, g: '#8c88a8' } },
  food: { rows: ['....l...', '...kl...', '.kkkkkk.', 'krwrrrrk', 'krrrrrrk', 'krrrrrrk', '.krrrrk.', '..kkkk..'], colors: { k: K, l: '#5fe08a', r: RESOURCE_COLORS.food, w: '#ffd0d0' } },
  energy: { rows: ['...kk...', '..kwck..', '.kwccck.', 'kwcccdck', 'kccccddk', '.kccddk.', '..kcdk..', '...kk...'], colors: { k: K, w: '#d8fbff', c: RESOURCE_COLORS.energy, d: '#1f9fc0' } },
  material: { rows: ['........', '..kkkk..', '.kwmmmk.', 'kwmmmmdk', 'kmmmmddk', 'kmmmdddk', '.kddddk.', '..kkkk..'], colors: { k: K, w: '#ead2b0', m: RESOURCE_COLORS.material, d: '#7d5c3c' } },
  shelter: { rows: ['...kk...', '..krrk..', '.krrrrk.', 'krrrrrrk', '.kwwwwk.', '.kwkkwk.', '.kwkkwk.', '.kkkkkk.'], colors: { k: K, r: '#e04848', w: '#f2e2bc' } },
  bubble: { rows: ['kkkkkkk.', 'kwwwwwwk', 'kwkwkwwk', 'kwwwwwwk', '.kkwkkk.', '..kk....', '........', '........'], colors: { k: K, w: '#ffffff' } },
  heart: { rows: ['.kk.kk..', 'krrkrrk.', 'krrrrrk.', '.krrrk..', '..krk...', '...k....', '........', '........'], colors: { k: K, r: INK.alert } },
} satisfies Record<string, Sprite>;
export type SpriteName = keyof typeof SPRITES;

const cache = new Map<string, HTMLCanvasElement>();

/** The sprite at one canvas pixel per sprite pixel, tinted, cached per tint. */
export function spriteCanvas(name: SpriteName, tint = '#ffffff'): HTMLCanvasElement {
  const key = `${name}:${tint}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const sprite: Sprite = SPRITES[name];
  const canvas = document.createElement('canvas');
  canvas.width = 8; canvas.height = 8;
  const ctx = canvas.getContext('2d')!;
  sprite.rows.forEach((row, y) => [...row].forEach((cell, x) => {
    if (cell === '.') return;
    ctx.fillStyle = cell === 'c' ? tint : sprite.colors[cell as keyof typeof sprite.colors] ?? tint;
    ctx.fillRect(x, y, 1, 1);
  }));
  cache.set(key, canvas);
  return canvas;
}

export function drawSprite(ctx: CanvasRenderingContext2D, name: SpriteName, x: number, y: number, size: number, tint?: string): void {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(spriteCanvas(name, tint), x, y, size, size);
}

/** Cheap stable noise per cell so the ground has texture without randomness between frames. */
const hash = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
};

let terrain: HTMLCanvasElement | undefined;

/** The whole ground at one canvas pixel per world pixel: checkered tiles, specks of texture, coarse grid every ten cells. */
export function terrainCanvas(): HTMLCanvasElement {
  if (terrain) return terrain;
  const canvas = document.createElement('canvas');
  canvas.width = FIELD; canvas.height = FIELD;
  const ctx = canvas.getContext('2d')!;
  for (const biome of BIOMES) for (let gy = biome.y; gy < biome.y + 50; gy++) for (let gx = biome.x; gx < biome.x + 50; gx++) {
    ctx.fillStyle = (gx + gy) % 2 ? biome.alt : biome.base;
    ctx.fillRect(gx * TILE, gy * TILE, TILE, TILE);
    const h = hash(gx, gy);
    if (h % 5 === 0) {
      ctx.fillStyle = biome.detail;
      const px = 2 + (h >>> 3) % 5, py = 2 + (h >>> 7) % 5;
      ctx.fillRect(gx * TILE + px * 2, gy * TILE + py * 2, 2, 2);
      if (h % 3 === 0) ctx.fillRect(gx * TILE + px * 2 + 2, gy * TILE + py * 2 - 2, 2, 2);
    }
  }
  ctx.fillStyle = '#00000038';
  for (let i = 10; i < GRID; i += 10) { ctx.fillRect(i * TILE - 1, 0, 2, FIELD); ctx.fillRect(0, i * TILE - 1, FIELD, 2); }
  terrain = canvas;
  return canvas;
}

/** A dashed, stepped line of square dots: the pixel version of a stroke. */
export function pixelLine(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, dot: number): void {
  const length = Math.hypot(x1 - x0, y1 - y0);
  const step = dot * 2;
  for (let d = 0; d <= length; d += step) {
    const t = length ? d / length : 0;
    const x = Math.round((x0 + (x1 - x0) * t) / dot) * dot, y = Math.round((y0 + (y1 - y0) * t) / dot) * dot;
    ctx.fillRect(x - dot / 2, y - dot / 2, dot, dot);
  }
}

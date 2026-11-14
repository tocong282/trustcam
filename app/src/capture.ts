export function checkPhotoDimensions(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || width * height > 20_000_000) throw new Error('camera_resolution');
}
export function selectPictureSize(sizes: string[]): string {
  const bounded = sizes.flatMap(size => {
    if (!/^\d+x\d+$/.test(size)) return [];
    const [width, height] = size.split('x').map(Number);
    try { checkPhotoDimensions(width, height); } catch { return []; }
    return [{ size, pixels: width * height }];
  });
  // Prefer ~2 MP, remain <=4 MP when supported; otherwise smallest bounded native size.
  const preferred = bounded.filter(item => item.pixels <= 4_000_000);
  const chosen = preferred.length ? preferred.sort((a, b) => Math.abs(a.pixels - 1920 * 1080) - Math.abs(b.pixels - 1920 * 1080))[0] : bounded.sort((a, b) => a.pixels - b.pixels)[0];
  if (!chosen) throw new Error('camera_resolution');
  return chosen.size;
}

export const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export function parseTime(value: string): number | null {
  const parts = value.trim().split(':').map(Number);
  if (!parts.length || parts.some(n => !Number.isInteger(n) || n < 0)) return null;
  const seconds = parts.reduce((total, n) => total * 60 + n, 0);
  return seconds <= 86400 ? seconds : null;
}

export const imageList = (work: { images: string[]; cover: string }) =>
  [...new Set((work.images.length ? work.images : [work.cover]).filter(Boolean))];

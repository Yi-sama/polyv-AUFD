import type { Work } from './types.ts';

export function filterWorks(works: Work[], type: string, query: string) {
  const term = query.trim().toLocaleLowerCase();
  return works.filter(work => (type === 'all' || work.type === type) &&
    (!term || `${work.title} ${work.subtitle} ${work.description}`.toLocaleLowerCase().includes(term)));
}
export function moveWork(works: Work[], from: number, to: number) {
  if (from < 0 || to < 0 || from >= works.length || to >= works.length || from === to) return works;
  const result = [...works]; const [work] = result.splice(from, 1); result.splice(to, 0, work); return result;
}
export const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
export function imageList(work: Work) {
  return [...new Set((work.images.length ? work.images : [work.cover]).filter(Boolean))];
}

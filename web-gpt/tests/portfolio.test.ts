import test from 'node:test';
import assert from 'node:assert/strict';
import { filterWorks, formatTime, imageList, moveWork } from '../src/portfolio-utils.ts';
import type { Work } from '../src/types.ts';
import { demoWorks, exhibitionWorks, getStory } from '../src/demo-content.ts';

const poster: Work = { id: 'poster', type: 'poster', title: 'AUFD', subtitle: '海报',
  date: '', description: '作品展示', cover: '/assets/poster.jpg', images: ['/assets/poster.jpg', '/uploads/2.webp'],
  featured: true, isDemo: false, videoId: '', highlights: [] };
const video: Work = { ...poster, id: 'video', type: 'video', title: '视频', subtitle: '官方示例' };

test('filters combine type and case-insensitive search without mutating data', () => {
  const works = [poster, video];
  assert.deepEqual(filterWorks(works, 'poster', ' aufd '), [poster]);
  assert.deepEqual(filterWorks(works, 'video', '作品'), [video]);
  assert.deepEqual(filterWorks(works, 'photo', ''), []);
  assert.deepEqual(works, [poster, video]);
});
test('reorder preserves records, invalid moves are no-ops', () => {
  const works = [poster, video];
  assert.deepEqual(moveWork(works, 0, 1), [video, poster]);
  assert.equal(moveWork(works, -1, 0), works);
  assert.equal(moveWork(works, 0, 2), works);
  assert.deepEqual(works, [poster, video]);
});
test('focus images deduplicate the cover and timestamps stay readable', () => {
  assert.deepEqual(imageList(poster), ['/assets/poster.jpg', '/uploads/2.webp']);
  assert.equal(formatTime(65), '1:05');
  assert.equal(formatTime(0), '0:00');
});

test('demo collection never mutates saved data and prefers saved ID collisions', () => {
  const saved = [poster, video];
  const shown = exhibitionWorks(saved);
  assert.equal(shown.length, saved.length + demoWorks.length);
  assert.deepEqual(saved, [poster, video]);
  assert.ok(demoWorks.every(work => work.isDemo && !work.videoId && getStory(work)?.images.length === imageList(work).length));
  const collision = { ...poster, id: demoWorks[0].id };
  const withCollision = exhibitionWorks([collision]);
  assert.equal(withCollision.filter(work => work.id === collision.id).length, 1);
  assert.equal(withCollision[0], collision);
  assert.equal(getStory(collision), undefined);
});

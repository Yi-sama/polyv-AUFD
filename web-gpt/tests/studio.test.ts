import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeDraft, draftSnapshot, encodeDraft, validateDraft } from '../src/studio-state.ts';
import { imageList } from '../src/portfolio-utils.ts';
import type { Portfolio } from '../src/types.ts';

const portfolio: Portfolio = {
  slug: 'liurunsen', revision: 3, media: {},
  profile: { name: '刘润森', alias: '', role: '', bio: '', about: '', email: '',
    cover: '/assets/poster.jpg', avatar: '/assets/poster.jpg', updatedAt: '' },
  works: [{ id: 'mixed', type: 'photo', title: '混合项目', subtitle: '', date: '', description: '',
    cover: '/assets/poster.jpg', images: ['/uploads/b.webp', '/uploads/a.webp'],
    videoId: 'official-video', isDemo: false, featured: true, highlights: [{title:'开场',seconds:0}] }],
};

test('mixed-media validation permits video in a photo project but rejects orphan highlights', () => {
  assert.equal(validateDraft(portfolio), null);
  const draft = structuredClone(portfolio);
  draft.works[0].videoId = '';
  assert.match(validateDraft(draft)!.message, /关联视频/);
  draft.works[0].highlights = [];
  assert.equal(validateDraft(draft), null);
  draft.works[0].date = '2026-02-30';
  assert.match(validateDraft(draft)!.message, /有效日期/);
});

test('gallery order is independent of the cover and survives video classification', () => {
  const work = portfolio.works[0];
  assert.deepEqual(imageList(work), work.images);
  assert.deepEqual(imageList({...work,type:'video'}), work.images);
  assert.deepEqual(imageList({...work,images:[]}), [work.cover]);
});

test('refresh backup preserves incomplete form fields and base revision', () => {
  const incomplete = structuredClone(portfolio);
  incomplete.works[0].title = '';
  incomplete.works[0].cover = '';
  const restored = decodeDraft(encodeDraft(incomplete), portfolio.slug)!;
  assert.equal(restored.revision, 3);
  assert.equal(draftSnapshot(restored), draftSnapshot(incomplete));
  assert.equal(decodeDraft(encodeDraft(incomplete), 'other'), null);
  assert.equal(decodeDraft('{invalid', portfolio.slug), null);
  assert.equal(decodeDraft(JSON.stringify({version:1,data:{slug:portfolio.slug}}), portfolio.slug), null);
});

test('invalid cached work shapes are rejected, server media does not create dirty state', () => {
  const invalid = structuredClone(portfolio);
  invalid.works.push({...invalid.works[0]});
  assert.equal(decodeDraft(encodeDraft(invalid), portfolio.slug), null);
  assert.equal(draftSnapshot({...portfolio,media:{foo:{width:10,height:10}}}), draftSnapshot(portfolio));
});

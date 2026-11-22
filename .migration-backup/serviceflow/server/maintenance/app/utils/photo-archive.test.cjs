const assert = require('node:assert/strict');
const { test } = require('node:test');
const { groupBoxArchiveMedia } = require('./photo');

test('box archive groups retain both photos and videos in before/after order', () => {
  const video = { id: 1, photo_type: 'before', media_type: 'video', filename: 'before.mp4' };
  const image = { id: 2, photo_type: 'before', media_type: 'photo', filename: 'before.jpg' };
  const afterVideo = { id: 3, photo_type: 'after', media_type: 'video', filename: 'after.mp4' };
  const grouped = groupBoxArchiveMedia([video, image, afterVideo]);

  assert.deepEqual(grouped.before, [video, image]);
  assert.deepEqual(grouped.after, [afterVideo]);
});

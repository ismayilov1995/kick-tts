import { expect, test } from 'bun:test';
import { SpeechQueue, type QueueItem } from '../src/queue';

const item = (id: string, priority: 1 | 2 | 3 = 3): QueueItem => ({ id, text: id, voiceId: 'v', priority, kind: 'chat', eventId: -1, username: 'u' });

test('higher priority first, FIFO inside a priority', () => {
  const q = new SpeechQueue();
  ['c1', 'c2'].forEach((id) => q.push(item(id, 3)));
  q.push(item('t1', 2));
  q.push(item('k1', 1));
  expect([q.next(), q.next(), q.next(), q.next(), q.next()].map((i) => i?.id)).toEqual(['k1', 't1', 'c1', 'c2', undefined]);
});

test('over the limit drops the oldest chat first', () => {
  const q = new SpeechQueue(2);
  q.push(item('c1'));
  q.push(item('t1', 2));
  expect(q.push(item('c2')).map((i) => i.id)).toEqual(['c1']);
  expect(q.size).toBe(2);
});

test('then the oldest template', () => {
  const q = new SpeechQueue(2);
  q.push(item('t1', 2));
  q.push(item('t2', 2));
  expect(q.push(item('t3', 2)).map((i) => i.id)).toEqual(['t1']);
});

test('paid events never count toward the limit and are never dropped', () => {
  const q = new SpeechQueue(2);
  for (let i = 0; i < 5; i++) expect(q.push(item(`k${i}`, 1))).toEqual([]);
  expect(q.size).toBe(5);
});

test('unshift puts an item back at the front of its priority', () => {
  const q = new SpeechQueue();
  q.push(item('c1'));
  q.unshift(item('c0'));
  expect(q.next()?.id).toBe('c0');
});

test('cap holds after unshift put-backs', () => {
  const q = new SpeechQueue(2);
  q.push(item('c1'));
  q.push(item('c2'));
  q.unshift(item('c0'));
  q.push(item('c3'));
  expect(q.size).toBe(2);
});

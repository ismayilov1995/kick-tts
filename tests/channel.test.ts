import { expect, test } from 'bun:test';
import { fetchChannelIds } from '../src/kick/channel';

const fetchOf = (body: unknown, status = 200) => (async () => Response.json(body, { status })) as unknown as typeof fetch;

test('reads channel and chatroom ids', async () => {
  expect(await fetchChannelIds('XQC', fetchOf({ id: 668, chatroom: { id: 669 } }))).toEqual({ channelId: '668', chatroomId: '669' });
});

test('Cloudflare 403 or bad shape returns null', async () => {
  expect(await fetchChannelIds('x', fetchOf({ error: 'blocked' }, 403))).toBeNull();
  expect(await fetchChannelIds('x', fetchOf({ id: '668' }))).toBeNull();
});

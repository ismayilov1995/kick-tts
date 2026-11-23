/** Kick username → numeric ids. Behind Cloudflare: may return 403, then the dashboard asks for the ids by hand. */
export async function fetchChannelIds(username: string, fetchFn: typeof fetch = fetch): Promise<{ channelId: string; chatroomId: string } | null> {
  try {
    const res = await fetchFn(`https://kick.com/api/v2/channels/${encodeURIComponent(username.trim().toLowerCase())}`, {
      headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const j: any = await res.json();
    return typeof j?.id === 'number' && typeof j?.chatroom?.id === 'number'
      ? { channelId: String(j.id), chatroomId: String(j.chatroom.id) }
      : null;
  } catch {
    return null;
  }
}

import { describe, expect, test } from 'bun:test';
import { DEFAULT_TEMPLATES, fill, TemplateResponder, triggers, type TemplateConfig, type TemplateKey } from '../src/templates';
import { DAY, T0, makeCtx, makeEvent } from './helpers';

const all = (enabled: boolean) =>
  Object.fromEntries(Object.entries(DEFAULT_TEMPLATES).map(([k, v]) => [k, { ...v, enabled }])) as Record<TemplateKey, TemplateConfig>;
const prev = { msgCount: 5, streak: 1, level: '🌱 Yeni', lastSeen: T0 };
const keys = (t: ReturnType<typeof triggers>) => t.map(([k]) => k);

describe('triggers', () => {
  test('level up uses the label without emoji', () => {
    expect(triggers(makeEvent(), makeCtx({ level: '👋 Tanış', prev }))).toContainEqual(['level_up', { level: 'Tanış' }]);
  });
  test('message milestone only when crossing it', () => {
    expect(triggers(makeEvent(), makeCtx({ msgCount: 100, prev: { ...prev, msgCount: 99 } }))).toContainEqual(['msg_milestone', { n: 100 }]);
    expect(keys(triggers(makeEvent({ type: 'reward' }), makeCtx({ msgCount: 100, prev: { ...prev, msgCount: 100 } })))).not.toContain('msg_milestone');
  });
  test('streak milestone only when the streak changes', () => {
    expect(triggers(makeEvent(), makeCtx({ streak: 3, prev: { ...prev, streak: 2 } }))).toContainEqual(['streak', { streak: 3 }]);
    expect(keys(triggers(makeEvent(), makeCtx({ streak: 3, prev: { ...prev, streak: 3 } })))).not.toContain('streak');
  });
  test('comeback after 7+ days', () => {
    expect(triggers(makeEvent(), makeCtx({ prev: { ...prev, lastSeen: T0 - 8 * DAY } }))).toContainEqual(['comeback', { days: 8 }]);
    expect(keys(triggers(makeEvent(), makeCtx({ prev: { ...prev, lastSeen: T0 - 6 * DAY } })))).not.toContain('comeback');
  });
  test('first message', () => {
    expect(keys(triggers(makeEvent(), makeCtx({ prev: null })))).toContain('first_message');
    expect(keys(triggers(makeEvent(), makeCtx({ prev })))).not.toContain('first_message');
  });
  test('spam above 10 messages per minute', () => {
    expect(keys(triggers(makeEvent(), makeCtx({ msgsLastMinute: 11, prev })))).toContain('spam');
    expect(keys(triggers(makeEvent(), makeCtx({ msgsLastMinute: 10, prev })))).not.toContain('spam');
  });
});

describe('TemplateResponder', () => {
  test('disabled templates say nothing', () => {
    const r = new TemplateResponder(() => all(false), () => T0, () => 0);
    expect(r.respond(makeEvent(), makeCtx({ prev: null }))).toEqual([]);
  });

  test('first matching trigger wins, announcer voice, priority 2', () => {
    const r = new TemplateResponder(() => all(true), () => T0, () => 0);
    expect(r.respond(makeEvent(), makeCtx({ level: '👋 Tanış', prev: null }))).toEqual([
      { text: 'Təbriklər, Murad! Yeni səviyyə: Tanış.', voice: 'announcer', priority: 2, kind: 'template:level_up' },
    ]);
  });

  test('once per viewer per trigger per session', () => {
    let now = T0;
    const r = new TemplateResponder(() => all(true), () => now, () => 0);
    expect(r.respond(makeEvent(), makeCtx({ prev: null }))).toHaveLength(1);
    now += 60_000;
    expect(r.respond(makeEvent(), makeCtx({ prev: null }))).toEqual([]);
  });

  test('global 30 s cooldown across viewers', () => {
    let now = T0;
    const r = new TemplateResponder(() => all(true), () => now, () => 0);
    const aysel = { userId: 'kick:2', username: 'Aysel', prev: null };
    expect(r.respond(makeEvent(), makeCtx({ prev: null }))).toHaveLength(1);
    now += 10_000;
    expect(r.respond(makeEvent(aysel), makeCtx(aysel))).toEqual([]);
    now += 21_000;
    expect(r.respond(makeEvent(aysel), makeCtx(aysel))).toHaveLength(1);
  });

  test('fill replaces known placeholders and blanks unknown ones', () => {
    expect(fill('{user} {n} {x}', { user: 'A', n: 5 })).toBe('A 5 ');
  });
});

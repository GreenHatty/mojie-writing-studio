import { describe, expect, it } from 'vitest';
import { createProjectEntity, detectCharacterLifeConflicts, detectTimelineConflicts, type TimelineEvent } from './project-model';

describe('createProjectEntity', () => {
  it('creates an editable project record with stable ownership metadata', () => {
    const entity = createProjectEntity({
      id: 'character-1',
      ownerId: 'owner-1',
      workId: 'work-1',
      kind: 'character',
      title: '沈砚',
      now: '2026-07-11T00:00:00.000Z',
      fields: { age: 23, aliases: ['阿砚'] }
    });

    expect(entity).toEqual(
      expect.objectContaining({
        id: 'character-1',
        ownerId: 'owner-1',
        workId: 'work-1',
        kind: 'character',
        title: '沈砚',
        createdAt: '2026-07-11T00:00:00.000Z',
        updatedAt: '2026-07-11T00:00:00.000Z'
      })
    );
  });
});

describe('detectTimelineConflicts', () => {
  it('detects impossible overlapping locations for the same character', () => {
    const events: TimelineEvent[] = [
      {
        id: 'event-1', ownerId: 'owner-1', workId: 'work-1', kind: 'timeline', title: '京城议事',
        summary: '', fields: {}, createdAt: '', updatedAt: '',
        startAt: '2026-01-01T08:00:00.000Z', endAt: '2026-01-01T10:00:00.000Z',
        characterIds: ['character-1'], locationId: 'location-a'
      },
      {
        id: 'event-2', ownerId: 'owner-1', workId: 'work-1', kind: 'timeline', title: '边城遇袭',
        summary: '', fields: {}, createdAt: '', updatedAt: '',
        startAt: '2026-01-01T09:00:00.000Z', endAt: '2026-01-01T11:00:00.000Z',
        characterIds: ['character-1'], locationId: 'location-b'
      }
    ];

    expect(detectTimelineConflicts(events)).toEqual([
      expect.objectContaining({ code: 'overlapping-location', eventIds: ['event-1', 'event-2'], characterId: 'character-1' })
    ]);
  });

  it('does not flag overlapping events at the same location', () => {
    const base: TimelineEvent = {
      id: 'event-1', ownerId: 'owner-1', workId: 'work-1', kind: 'timeline', title: '同场事件',
      summary: '', fields: {}, createdAt: '', updatedAt: '',
      startAt: '2026-01-01T08:00:00.000Z', endAt: '2026-01-01T10:00:00.000Z',
      characterIds: ['character-1'], locationId: 'location-a'
    };
    expect(detectTimelineConflicts([{ ...base }, { ...base, id: 'event-2', title: '另一视角' }])).toHaveLength(0);
  });

  it('detects a dependent event that begins before its predecessor ends', () => {
    const predecessor: TimelineEvent = { id: 'a', ownerId: 'owner', workId: 'work', kind: 'timeline', title: '前置', summary: '', fields: {}, createdAt: '', updatedAt: '', startAt: '2026-01-01T08:00:00Z', endAt: '2026-01-01T10:00:00Z', characterIds: [] };
    const dependent: TimelineEvent = { ...predecessor, id: 'b', title: '后续', startAt: '2026-01-01T09:00:00Z', endAt: '2026-01-01T11:00:00Z', predecessorIds: ['a'] };
    expect(detectTimelineConflicts([predecessor, dependent])).toContainEqual(expect.objectContaining({ code: 'predecessor-order', eventIds: ['a', 'b'] }));
  });

  it('detects appearances outside a character life range', () => {
    const event: TimelineEvent = { id: 'event', ownerId: 'owner', workId: 'work', kind: 'timeline', title: '旧事', summary: '', fields: {}, createdAt: '', updatedAt: '', startAt: '1999-01-01T00:00:00Z', endAt: '1999-01-02T00:00:00Z', characterIds: ['character'] };
    expect(detectCharacterLifeConflicts([event], [{ id: 'character', title: '沈青', birthDate: '2000-01-01T00:00:00Z' }])).toContainEqual(expect.objectContaining({ code: 'before-birth', characterId: 'character' }));
  });
});

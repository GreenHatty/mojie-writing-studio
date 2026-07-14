export type ProjectEntityKind =
  | 'outline'
  | 'chapter-plan'
  | 'character'
  | 'location'
  | 'timeline'
  | 'relationship'
  | 'material'
  | 'world'
  | 'faction'
  | 'goal'
  | 'dictionary';

export type ProjectFieldValue = string | number | boolean | string[] | null;

export type ProjectEntity = {
  id: string;
  ownerId: string;
  workId: string;
  kind: ProjectEntityKind;
  title: string;
  summary: string;
  fields: Record<string, ProjectFieldValue>;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};

export type TimelineEvent = ProjectEntity & {
  kind: 'timeline';
  startAt: string;
  endAt: string;
  characterIds: string[];
  locationId?: string;
  chapterIds?: string[];
  predecessorIds?: string[];
  isForeshadowing?: boolean;
};

export type TimelineConflict = {
  code: 'invalid-range' | 'overlapping-location' | 'predecessor-order' | 'before-birth' | 'after-death';
  message: string;
  eventIds: string[];
  characterId?: string;
};

export type CreateProjectEntityInput = {
  id: string;
  ownerId: string;
  workId: string;
  kind: ProjectEntityKind;
  title: string;
  now: string;
  summary?: string;
  fields?: Record<string, ProjectFieldValue>;
};

export function createProjectEntity(input: CreateProjectEntityInput): ProjectEntity {
  const title = input.title.trim();
  if (!title) throw new Error('设定名称不能为空');
  return {
    id: input.id,
    ownerId: input.ownerId,
    workId: input.workId,
    kind: input.kind,
    title,
    summary: input.summary?.trim() ?? '',
    fields: { ...(input.fields ?? {}) },
    createdAt: input.now,
    updatedAt: input.now
  };
}

function asTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.NaN;
}

export function detectTimelineConflicts(events: TimelineEvent[]): TimelineConflict[] {
  const conflicts: TimelineConflict[] = [];

  for (const event of events) {
    const start = asTimestamp(event.startAt);
    const end = asTimestamp(event.endAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
      conflicts.push({
        code: 'invalid-range',
        message: `“${event.title}”的开始与结束时间无效`,
        eventIds: [event.id]
      });
    }
  }

  const byId = new Map(events.map((event) => [event.id, event]));
  for (const event of events) {
    const eventStart = asTimestamp(event.startAt);
    if (!Number.isFinite(eventStart)) continue;
    for (const predecessorId of event.predecessorIds ?? []) {
      const predecessor = byId.get(predecessorId);
      if (!predecessor) continue;
      const predecessorEnd = asTimestamp(predecessor.endAt);
      if (Number.isFinite(predecessorEnd) && predecessorEnd > eventStart) conflicts.push({ code: 'predecessor-order', message: `“${event.title}”早于前置事件“${predecessor.title}”结束`, eventIds: [predecessor.id, event.id] });
    }
  }

  for (let leftIndex = 0; leftIndex < events.length; leftIndex += 1) {
    const left = events[leftIndex]!;
    const leftStart = asTimestamp(left.startAt);
    const leftEnd = asTimestamp(left.endAt);
    if (!Number.isFinite(leftStart) || !Number.isFinite(leftEnd)) continue;

    for (let rightIndex = leftIndex + 1; rightIndex < events.length; rightIndex += 1) {
      const right = events[rightIndex]!;
      const rightStart = asTimestamp(right.startAt);
      const rightEnd = asTimestamp(right.endAt);
      if (!Number.isFinite(rightStart) || !Number.isFinite(rightEnd)) continue;
      const overlaps = leftStart < rightEnd && rightStart < leftEnd;
      if (!overlaps || !left.locationId || !right.locationId || left.locationId === right.locationId) continue;
      const sharedCharacters = left.characterIds.filter((characterId) => right.characterIds.includes(characterId));
      for (const characterId of sharedCharacters) {
        conflicts.push({
          code: 'overlapping-location',
          message: `同一人物在重叠时间内出现在不同地点：“${left.title}”与“${right.title}”`,
          eventIds: [left.id, right.id],
          characterId
        });
      }
    }
  }

  return conflicts;
}

export function detectCharacterLifeConflicts(events: TimelineEvent[], characters: Array<{ id: string; title: string; birthDate?: string; deathAt?: string }>): TimelineConflict[] {
  const conflicts: TimelineConflict[] = [];
  const byId = new Map(characters.map((character) => [character.id, character]));
  for (const event of events) {
    const eventStart = asTimestamp(event.startAt);
    const eventEnd = asTimestamp(event.endAt);
    if (!Number.isFinite(eventStart) || !Number.isFinite(eventEnd)) continue;
    for (const characterId of event.characterIds) {
      const character = byId.get(characterId);
      if (!character) continue;
      const birth = character.birthDate ? asTimestamp(character.birthDate) : Number.NaN;
      const death = character.deathAt ? asTimestamp(character.deathAt) : Number.NaN;
      if (Number.isFinite(birth) && eventStart < birth) conflicts.push({ code: 'before-birth', message: `“${character.title}”在出生前出现在事件“${event.title}”`, eventIds: [event.id], characterId });
      if (Number.isFinite(death) && eventEnd > death) conflicts.push({ code: 'after-death', message: `“${character.title}”在死亡后出现在事件“${event.title}”`, eventIds: [event.id], characterId });
    }
  }
  return conflicts;
}

import { describe, expect, it } from 'vitest';
import { lessonClinic } from './lesson-clinics';
import { WRITING_LESSONS } from './lessons';

describe('writing lesson clinics', () => {
  it('turns core lessons into concrete workflows with worked examples and acceptance criteria', () => {
    for (const id of ['first-three', 'outline', 'chapter-rhythm', 'chapter-hook', 'romance', 'revision']) {
      const source = WRITING_LESSONS.find((lesson) => lesson.id === id)!;
      const clinic = lessonClinic(source);
      expect(clinic.procedure.length).toBeGreaterThanOrEqual(4);
      expect(clinic.before).not.toBe(clinic.after);
      expect(clinic.assignment).toMatch(/当前|作品|章节/u);
      expect(clinic.acceptance.length).toBeGreaterThanOrEqual(3);
    }
  });
});

/**
 * Pure-logic unit tests for the Teacher Page slug helpers and row normalizers.
 * Node environment; the supabase client and auth helpers are stubbed away so
 * only the pure layer is exercised (same approach as database.mappers tests).
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../supabase');
vi.mock('../localAuth');

import {
  normalizeSlugInput,
  slugProblem,
  slugErrorText,
  suggestSlugsLocal,
  normalizePage,
  normalizeMedia,
  teacherStorageFolder,
  MIN_SLUG_LENGTH,
  MAX_SLUG_LENGTH,
} from '../teacherPage';

describe('normalizeSlugInput', () => {
  it('lowercases and converts separators to hyphens', () => {
    expect(normalizeSlugInput('  Sharma Classes  ')).toBe('sharma-classes');
    expect(normalizeSlugInput('Ravi_Sharma Math')).toBe('ravi-sharma-math');
  });

  it('strips invalid characters and collapses repeated hyphens', () => {
    expect(normalizeSlugInput('Sharma!! Classes__2026')).toBe('sharma-classes-2026');
    expect(normalizeSlugInput('a--b')).toBe('a-b');
  });

  it('trims leading/trailing hyphens', () => {
    expect(normalizeSlugInput('--physics-wallah--')).toBe('physics-wallah');
  });

  it('can return an empty string for garbage input', () => {
    expect(normalizeSlugInput('###')).toBe('');
  });
});

describe('slugProblem', () => {
  it('accepts valid slugs', () => {
    expect(slugProblem('sharma-classes')).toBeNull();
    expect(slugProblem('abc')).toBeNull();
    expect(slugProblem('a1-b2')).toBeNull();
  });

  it('rejects by length', () => {
    expect(slugProblem('ab')).toBe('too-short');
    expect(slugProblem('a'.repeat(MIN_SLUG_LENGTH + 1))).toBeNull();
    expect(slugProblem('a'.repeat(MAX_SLUG_LENGTH + 1))).toBe('too-long');
    expect(slugProblem('a'.repeat(MAX_SLUG_LENGTH))).toBeNull();
  });

  it('hyphen placement is fixed by normalization, not rejected', () => {
    // slugProblem validates the NORMALIZED slug (mirroring the save path),
    // so edge hyphens and doubled hyphens are cleaned rather than flagged:
    expect(slugProblem('-leading')).toBeNull();
    expect(slugProblem('trailing-')).toBeNull();
    expect(slugProblem('dou--ble')).toBeNull();
    expect(slugProblem('do-uble')).toBeNull();
  });

  it('rejects reserved routes', () => {
    expect(slugProblem('admin')).toBe('reserved');
    expect(slugProblem('t')).toBe('too-short'); // length wins over reserved
    expect(slugProblem('register')).toBe('reserved');
  });
});

describe('slugErrorText', () => {
  it('maps every problem to a non-empty message', () => {
    for (const p of ['empty', 'too-short', 'too-long', 'format', 'reserved', 'taken'] as const) {
      expect(slugErrorText(p).length).toBeGreaterThan(0);
    }
  });
});

describe('suggestSlugsLocal', () => {
  it('suggests the cleaned base first when it is already valid', () => {
    expect(suggestSlugsLocal('sharma classes')[0]).toBe('sharma-classes');
  });

  it('skips candidates reported as taken', () => {
    const out = suggestSlugsLocal('sharma', c => c === 'sharma' || c === 'sharma-classes');
    expect(out).not.toContain('sharma');
    expect(out).not.toContain('sharma-classes');
    expect(out[0]).toBe('sharma-academy');
  });

  it('caps at 3 suggestions', () => {
    expect(suggestSlugsLocal('physics')).toHaveLength(3);
  });

  it('falls back to a safe base when nothing usable remains of the input', () => {
    const out = suggestSlugsLocal('##');
    expect(out.length).toBeGreaterThan(0);
    expect(out.every(s => slugProblem(s) === null)).toBe(true);
  });

  it('keeps long bases within the length cap after suffixing', () => {
    const long = 'sharma-physics-classes-for-neet-and-jee-coaching';
    const out = suggestSlugsLocal(long);
    expect(out.every(s => s.length <= MAX_SLUG_LENGTH)).toBe(true);
  });
});

describe('normalizePage', () => {
  it('maps a raw row defensively', () => {
    const page = normalizePage({
      id: 'p1',
      slug: 'sharma-classes',
      teacher_username: 'Sharma',
      teacher_id: null,
      display_name: 'Ravi Sharma',
      coaching_name: '',
      tagline: null,
      subjects: ['Physics', 42, 'Maths'],
      theme: { accent: '#7c3aed' },
      status: 'published',
      published_at: '2026-09-13T00:00:00Z',
      preview_token: 'tok',
      view_count: 'not-a-number',
      created_at: '2026-09-13T00:00:00Z',
      updated_at: '2026-09-13T00:00:00Z',
    });
    expect(page).not.toBeNull();
    expect(page!.coaching_name).toBeNull();
    expect(page!.subjects).toEqual(['Physics', 'Maths']);
    expect(page!.view_count).toBe(0);
    expect(page!.theme).toEqual({ accent: '#7c3aed' });
  });

  it('coerces any non-published status to draft', () => {
    const page = normalizePage({ id: 'p1', status: 'weird' });
    expect(page!.status).toBe('draft');
  });

  it('returns null for missing/invalid rows', () => {
    expect(normalizePage(null)).toBeNull();
    expect(normalizePage({})).toBeNull();
  });
});

describe('normalizeMedia', () => {
  it('maps rows and defaults unknown kinds to achievement', () => {
    const media = normalizeMedia([
      { id: 'm1', kind: 'classroom', storage_path: 'teacher_pages/x/classroom/a.jpg', sort_order: 2 },
      { id: 'm2', kind: 'bogus', storage_path: 'teacher_pages/x/achievement/b.jpg' },
      { no_path: true },
    ]);
    expect(media).toHaveLength(2);
    expect(media[0].kind).toBe('classroom');
    expect(media[1].kind).toBe('achievement');
    expect(media[1].sort_order).toBe(0);
  });

  it('tolerates non-array input', () => {
    expect(normalizeMedia(null)).toEqual([]);
    expect(normalizeMedia('nope')).toEqual([]);
  });
});

describe('teacherStorageFolder', () => {
  it('keeps safe ids and strips unsafe characters', () => {
    expect(teacherStorageFolder('teacher-demo-1234')).toBe('teacher-demo-1234');
    expect(teacherStorageFolder('user@example.com')).toBe('userexamplecom');
    expect(teacherStorageFolder('')).toBe('teacher');
  });
});

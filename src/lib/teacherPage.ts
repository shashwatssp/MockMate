/**
 * Teacher Page (Phase 1) data layer — public portfolio + enrollment funnel.
 *
 * All writes flow through the `app_*` security-definer RPC family (same
 * session-token pattern as batches/questions); the migration lives at
 * `supabase/migrations/20260913090000_teacher_pages.sql`. Slug helpers below
 * are pure and mirrored server-side (`app_slug_is_valid` / `app_slug_reserved`)
 * so the builder can give instant feedback; the server always re-validates.
 */
import { toErrorMessage } from '../lib/errors';
import { supabase, callRpc } from './supabase';
import { getTeacherToken } from './localAuth';

// ---------------------------------------------------------------------------
// Slug rules (mirror of public.app_slug_is_valid / app_slug_reserved)
// ---------------------------------------------------------------------------
export const MIN_SLUG_LENGTH = 3;
export const MAX_SLUG_LENGTH = 30;
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const RESERVED_SLUGS: readonly string[] = [
  'www', 'admin', 'api', 'app', 'login', 'signup', 'register', 'student',
  'teacher', 'exam', 'dashboard', 'batches', 'create-test', 'import-pdf',
  'print', 'auth', 't', 'about', 'help', 'support', 'pricing', 'blog',
  'demo', 'mockmate', 'static', 'assets',
];

export type SlugProblem =
  | 'empty'
  | 'too-short'
  | 'too-long'
  | 'format'
  | 'reserved'
  | 'taken';

/** Clean a raw candidate into slug shape: lowercase, separators -> hyphens,
 *  strip invalid chars, collapse repeats, trim hyphens. */
export const normalizeSlugInput = (raw: string): string =>
  (raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');

/** Null when the slug is claimable-shape; otherwise the problem with it. */
export const slugProblem = (slug: string): SlugProblem | null => {
  const s = normalizeSlugInput(slug);
  if (!s) return 'empty';
  if (s.length < MIN_SLUG_LENGTH) return 'too-short';
  if (s.length > MAX_SLUG_LENGTH) return 'too-long';
  if (!SLUG_PATTERN.test(s)) return 'format';
  if (RESERVED_SLUGS.includes(s)) return 'reserved';
  return null;
};

export const slugErrorText = (problem: SlugProblem): string => {
  switch (problem) {
    case 'empty': return 'Pick an address for your page.';
    case 'too-short': return `Use at least ${MIN_SLUG_LENGTH} characters.`;
    case 'too-long': return `Keep it under ${MAX_SLUG_LENGTH} characters.`;
    case 'format': return 'Letters, numbers and hyphens only (no spaces).';
    case 'reserved': return 'That address is reserved by MockMate.';
    case 'taken': return 'That address is already taken.';
  }
};

/** Pure suggestion generator (fallback when the server check is unavailable):
 *  cleaned base + familiar suffixes, filtered through the same rules. Unlike
 *  the server-side generator, the wanted slug itself is a valid suggestion
 *  here — taken-ness is unknown locally and the cleaned base is usually the
 *  best answer. */
export const suggestSlugsLocal = (
  raw: string,
  isTaken: (candidate: string) => boolean = () => false,
): string[] => {
  let base = normalizeSlugInput(raw);
  if (!base) base = 'my-classes';
  if (base.length > 27) base = base.slice(0, 27).replace(/-+$/g, '');
  const suffixes = ['', '-classes', '-academy', '-coaching', '-1', '-2', '-3'];
  const out: string[] = [];
  for (const suffix of suffixes) {
    const candidate = base + suffix;
    if (
      out.includes(candidate) ||
      isTaken(candidate) ||
      slugProblem(candidate) !== null
    ) continue;
    out.push(candidate);
    if (out.length >= 3) break;
  }
  return out;
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type TeacherPageStatus = 'draft' | 'published';

export interface TeacherPage {
  id: string;
  slug: string;
  teacher_username: string;
  teacher_id: string | null;
  display_name: string;
  coaching_name: string | null;
  tagline: string | null;
  bio: string | null;
  hero_image_url: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  contact_whatsapp: string | null;
  social_links: Record<string, string>;
  subjects: string[];
  theme: { accent?: string; template?: string } & Record<string, unknown>;
  status: TeacherPageStatus;
  published_at: string | null;
  preview_token: string;
  view_count: number;
  created_at: string;
  updated_at: string;
}

export interface TeacherPageMedia {
  id: string;
  kind: 'achievement' | 'classroom';
  storage_path: string;
  caption: string | null;
  alt_text: string | null;
  sort_order: number;
}

export interface PublicBatchCard {
  id: string;
  code: string;
  name: string;
  description: string | null;
}

export interface PublicTeacherPageData {
  page: TeacherPage;
  media: TeacherPageMedia[];
  batches: PublicBatchCard[];
  preview: boolean;
}

export interface TeacherPageInput {
  slug: string;
  display_name: string;
  coaching_name?: string | null;
  tagline?: string | null;
  bio?: string | null;
  hero_image_url?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  contact_whatsapp?: string | null;
  social_links?: Record<string, string>;
  subjects?: string[];
  theme?: Record<string, unknown>;
}

export interface SlugCheckResult {
  available: boolean;
  reason: SlugProblem | 'own' | 'unverified' | null;
  suggestions: string[];
}

// ---------------------------------------------------------------------------
// Row normalizers (defensive mapping of raw RPC jsonb)
// ---------------------------------------------------------------------------
const asString = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v : fallback;

const asStringOrNull = (v: unknown): string | null =>
  typeof v === 'string' && v.length > 0 ? v : null;

export const normalizePage = (row: Record<string, unknown> | null): TeacherPage | null => {
  if (!row || typeof row.id !== 'string') return null;
  const status = row.status === 'published' ? 'published' : 'draft';
  const subjects = Array.isArray(row.subjects)
    ? row.subjects.filter((s): s is string => typeof s === 'string')
    : [];
  const theme =
    row.theme && typeof row.theme === 'object' && !Array.isArray(row.theme)
      ? (row.theme as TeacherPage['theme'])
      : {};
  const socialLinks: Record<string, string> =
    row.social_links && typeof row.social_links === 'object' && !Array.isArray(row.social_links)
      ? Object.fromEntries(
          Object.entries(row.social_links as Record<string, unknown>)
            .filter(([, v]) => typeof v === 'string')
            .map(([k, v]) => [k, v as string]),
        )
      : {};
  return {
    id: row.id,
    slug: asString(row.slug),
    teacher_username: asString(row.teacher_username),
    teacher_id: asStringOrNull(row.teacher_id),
    display_name: asString(row.display_name),
    coaching_name: asStringOrNull(row.coaching_name),
    tagline: asStringOrNull(row.tagline),
    bio: asStringOrNull(row.bio),
    hero_image_url: asStringOrNull(row.hero_image_url),
    contact_phone: asStringOrNull(row.contact_phone),
    contact_email: asStringOrNull(row.contact_email),
    contact_whatsapp: asStringOrNull(row.contact_whatsapp),
    social_links: socialLinks,
    subjects,
    theme,
    status,
    published_at: asStringOrNull(row.published_at),
    preview_token: asString(row.preview_token),
    view_count: typeof row.view_count === 'number' ? row.view_count : 0,
    created_at: asString(row.created_at),
    updated_at: asString(row.updated_at),
  };
};

export const normalizeMedia = (rows: unknown): TeacherPageMedia[] =>
  Array.isArray(rows)
    ? rows
        .map((raw): TeacherPageMedia | null => {
          const row = (raw ?? {}) as Record<string, unknown>;
          if (typeof row.storage_path !== 'string') return null;
          const kind = row.kind === 'classroom' ? 'classroom' : 'achievement';
          return {
            id: asString(row.id),
            kind,
            storage_path: row.storage_path,
            caption: asStringOrNull(row.caption),
            alt_text: asStringOrNull(row.alt_text),
            sort_order: typeof row.sort_order === 'number' ? row.sort_order : 0,
          };
        })
        .filter((m): m is TeacherPageMedia => m !== null)
    : [];

// ---------------------------------------------------------------------------
// Error annotation (migration-not-applied guidance, mirroring insertQuestions)
// ---------------------------------------------------------------------------
const annotateRpcError = (err: unknown): Error => {
  const message = toErrorMessage(err);
  if (/could not find the function|pgrst202|schema cache/i.test(message)) {
    return new Error(
      'The Teacher Page backend is not deployed yet. Run '
      + 'supabase/migrations/20260913090000_teacher_pages.sql in the Supabase '
      + 'SQL editor, then try again.',
    );
  }
  return err instanceof Error ? err : new Error(message);
};

// ---------------------------------------------------------------------------
// RPC wrappers
// ---------------------------------------------------------------------------
const requireToken = (): string => {
  const token = getTeacherToken();
  if (!token) throw new Error('Not authenticated. Sign in as a teacher first.');
  return token;
};

/** Debounced-check target for the builder. Falls back to local validation when
 *  the RPC is missing (reason 'unverified') — the save path remains the
 *  authoritative gate either way. */
export const checkSlugAvailability = async (raw: string): Promise<SlugCheckResult> => {
  const slug = normalizeSlugInput(raw);
  const problem = slugProblem(slug);
  if (problem) {
    return { available: false, reason: problem, suggestions: suggestSlugsLocal(raw) };
  }
  const args: Record<string, unknown> = { p_slug: slug };
  const token = getTeacherToken();
  if (token) args.p_token = token;
  try {
    const res = await callRpc<{
      available?: boolean;
      reason?: string | null;
      suggestions?: string[] | null;
    }>('app_check_slug', args);
    return {
      available: Boolean(res?.available),
      reason: (res?.reason as SlugCheckResult['reason']) ?? null,
      suggestions: Array.isArray(res?.suggestions)
        ? res!.suggestions!.filter((s): s is string => typeof s === 'string')
        : [],
    };
  } catch (err) {
    console.warn('[teacherPage] app_check_slug unavailable, using local validation:', err);
    return { available: true, reason: 'unverified', suggestions: suggestSlugsLocal(raw) };
  }
};

/** Owner read: { page: null, media: [] } until the teacher saves once. */
export const getMyTeacherPage = async (): Promise<{
  page: TeacherPage | null;
  media: TeacherPageMedia[];
}> => {
  const token = requireToken();
  try {
    const res = await callRpc<{ page?: Record<string, unknown> | null; media?: unknown }>(
      'app_get_teacher_page',
      { p_token: token },
    );
    return {
      page: normalizePage(res?.page ?? null),
      media: normalizeMedia(res?.media),
    };
  } catch (err) {
    throw annotateRpcError(err);
  }
};

/** Upsert the owner's page (draft-only slug changes; status managed via
 *  publishTeacherPage). Returns the saved row. */
export const saveTeacherPage = async (input: TeacherPageInput): Promise<TeacherPage> => {
  const token = requireToken();
  const payload = {
    slug: normalizeSlugInput(input.slug),
    display_name: input.display_name.trim(),
    coaching_name: input.coaching_name?.trim() || '',
    tagline: input.tagline?.trim() || '',
    bio: input.bio?.trim() || '',
    hero_image_url: input.hero_image_url || '',
    contact_phone: input.contact_phone?.trim() || '',
    contact_email: input.contact_email?.trim() || '',
    contact_whatsapp: input.contact_whatsapp?.trim() || '',
    social_links: input.social_links ?? {},
    subjects: (input.subjects ?? []).slice(0, 12),
    theme: input.theme ?? {},
  };
  try {
    const saved = await callRpc<Record<string, unknown>>('app_save_teacher_page', {
      p_token: token,
      p_page: payload,
    });
    const page = normalizePage(saved);
    if (!page) throw new Error('Saved, but the server returned an unexpected response.');
    return page;
  } catch (err) {
    throw annotateRpcError(err);
  }
};

/** Atomically replace the owner's media set (upload files first, then persist
 *  the ordered list). Returns the number of saved items. */
export const setPageMedia = async (items: TeacherPageMedia[]): Promise<number> => {
  const token = requireToken();
  if (items.length > 24) throw new Error('A page can hold at most 24 images.');
  try {
    const res = await callRpc<{ saved?: number }>('app_set_page_media', {
      p_token: token,
      p_media: items.map(m => ({
        kind: m.kind,
        storage_path: m.storage_path,
        caption: m.caption ?? '',
        alt_text: m.alt_text ?? '',
        sort_order: m.sort_order,
      })),
    });
    return typeof res?.saved === 'number' ? res.saved : items.length;
  } catch (err) {
    throw annotateRpcError(err);
  }
};

/** Publish / unpublish. Publishing stamps published_at and freezes the slug. */
export const publishTeacherPage = async (status: 'draft' | 'published'): Promise<TeacherPage> => {
  const token = requireToken();
  try {
    const saved = await callRpc<Record<string, unknown>>('app_publish_teacher_page', {
      p_token: token,
      p_status: status,
    });
    const page = normalizePage(saved);
    if (!page) throw new Error('Status changed, but the server returned an unexpected response.');
    return page;
  } catch (err) {
    throw annotateRpcError(err);
  }
};

/** Public read path for /t/<slug>. Returns null for unknown slugs, hidden
 *  drafts, or drafts without the exact preview token. */
export const getPublicTeacherPage = async (
  slug: string,
  previewToken?: string | null,
): Promise<PublicTeacherPageData | null> => {
  const args: Record<string, unknown> = { p_slug: normalizeSlugInput(slug) };
  if (previewToken) args.p_preview_token = previewToken;
  try {
    const res = await callRpc<{
      page?: Record<string, unknown> | null;
      media?: unknown;
      batches?: unknown;
      preview?: boolean;
    }>('app_get_public_teacher_page', args);
    const page = normalizePage(res?.page ?? null);
    if (!page) return null;
    return {
      page,
      media: normalizeMedia(res?.media),
      batches: Array.isArray(res?.batches)
        ? (res!.batches as Array<Record<string, unknown>>).map(b => ({
            id: asString(b.id),
            code: asString(b.code),
            name: asString(b.name),
            description: asStringOrNull(b.description),
          }))
        : [],
      preview: Boolean(res?.preview),
    };
  } catch (err) {
    // Unknown-slug and network failures both surface as "not available".
    console.warn('[teacherPage] public page fetch failed:', err);
    return null;
  }
};

// ---------------------------------------------------------------------------
// Storage (public `teacher-pages` bucket)
// ---------------------------------------------------------------------------
export const TEACHER_PAGE_BUCKET = 'teacher-pages';
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // pre-compression cap

/** Storage folder for the teacher's own files. Accepts any id shape (local
 *  demo ids included) by stripping unsafe characters. */
export const teacherStorageFolder = (teacherId: string): string =>
  (teacherId || 'teacher').replace(/[^a-zA-Z0-9_-]/g, '') || 'teacher';

/** Resolve a stored media path to its public URL (used by the public page,
 *  which only receives storage_path values from the RPC). */
export const publicUrlForPath = (path: string): string =>
  supabase.storage.from(TEACHER_PAGE_BUCKET).getPublicUrl(path).data?.publicUrl ?? '';

/** Upload a page image and return its storage path + public URL. The folder
 *  is the media kind ('achievement' | 'classroom'), 'hero' for the photo, or
 *  'cover' for the hero cover band. */
export const uploadTeacherPageImage = async (
  file: File,
  kind: TeacherPageMedia['kind'] | 'hero' | 'cover',
  teacherId: string,
): Promise<{ path: string; publicUrl: string }> => {
  if (!file) throw new Error('No file provided.');
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('Images must be 5 MB or smaller (they are compressed automatically).');
  }
  const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const uid = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const path = `teacher_pages/${teacherStorageFolder(teacherId)}/${kind}/${uid}.${ext}`;
  const { error } = await supabaseStorageUpload(path, file);
  if (error) throw error;
  return { path, publicUrl: supabaseStoragePublicUrl(path) };
};

// Small indirections so tests can stub storage without a network.
const supabaseStorageUpload = (path: string, file: File) =>
  supabase.storage.from(TEACHER_PAGE_BUCKET).upload(path, file, { upsert: false });

const supabaseStoragePublicUrl = (path: string): string =>
  supabase.storage.from(TEACHER_PAGE_BUCKET).getPublicUrl(path).data?.publicUrl ?? '';

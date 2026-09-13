import { toErrorMessage } from '../lib/errors';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeCanvas } from 'qrcode.react';
import {
  AlertCircle, ArrowDown, ArrowUp, Camera, Check, ChevronDown, ChevronUp, Copy,
  Eye, EyeOff, ExternalLink, Globe, ImagePlus, Instagram, Loader2, Monitor, Phone,
  Rocket, Share2, Smartphone, Trash2, Users, X, Youtube, BadgeCheck, MessageCircle, Mail,
} from 'lucide-react';
import {
  checkSlugAvailability, getMyTeacherPage, normalizeSlugInput, publicUrlForPath,
  publishTeacherPage, saveTeacherPage, setPageMedia, slugProblem, slugErrorText,
  uploadTeacherPageImage,
} from '../lib/teacherPage';
import type {
  PublicBatchCard, SlugCheckResult, SlugProblem, TeacherPage, TeacherPageMedia,
} from '../lib/teacherPage';
import { compressImage } from '../lib/imageCompress';
import { getTeacherSession } from '../lib/localAuth';
import {
  getBatchesForTeacher, getPendingEnrollments, getStudentsInBatch, updateBatch,
} from '../lib/database';
import type { BatchRow } from '../lib/database';
import { TeacherPageView } from './TeacherPageView';
import { SkeletonList } from './Skeleton';
import { copyTextToClipboard, notifyError, notifySuccess } from '../lib/shareToast';
import './TeacherPageBuilder.css';

type SectionKey = 'slug' | 'hero' | 'about' | 'achievements' | 'classroom' | 'batches' | 'contact';
type PreviewMode = 'edit' | 'phone' | 'desktop';

/** True desktop viewport width rendered by the desktop preview canvas. */
const DESKTOP_FRAME_WIDTH = 1280;

interface DraftState {
  slug: string;
  display_name: string;
  coaching_name: string;
  tagline: string;
  bio: string;
  contact_phone: string;
  contact_whatsapp: string;
  contact_email: string;
  social_website: string;
  social_instagram: string;
  social_youtube: string;
  accent: string;
  hero_image_url: string;
  cover_image_url: string;
  subjects: string;
}

const EMPTY_DRAFT: DraftState = {
  slug: '',
  display_name: '',
  coaching_name: '',
  tagline: '',
  bio: '',
  contact_phone: '',
  contact_whatsapp: '',
  contact_email: '',
  social_website: '',
  social_instagram: '',
  social_youtube: '',
  accent: '#6366f1',
  hero_image_url: '',
  cover_image_url: '',
  subjects: '',
};

const toDraft = (page: TeacherPage): DraftState => ({
  slug: page.slug,
  display_name: page.display_name,
  coaching_name: page.coaching_name ?? '',
  tagline: page.tagline ?? '',
  bio: page.bio ?? '',
  contact_phone: page.contact_phone ?? '',
  contact_whatsapp: page.contact_whatsapp ?? '',
  contact_email: page.contact_email ?? '',
  social_website: page.social_links?.website ?? '',
  social_instagram: page.social_links?.instagram ?? '',
  social_youtube: page.social_links?.youtube ?? '',
  accent: page.theme?.accent ?? '#6366f1',
  hero_image_url: page.hero_image_url ?? '',
  cover_image_url: typeof page.theme?.cover_image_url === 'string' ? page.theme.cover_image_url : '',
  subjects: page.subjects.join(', '),
});

const draftToPage = (draft: DraftState, saved: TeacherPage | null): TeacherPage => ({
  id: saved?.id ?? 'draft',
  slug: normalizeSlugInput(draft.slug),
  teacher_username: saved?.teacher_username ?? '',
  teacher_id: saved?.teacher_id ?? null,
  display_name: draft.display_name.trim(),
  coaching_name: draft.coaching_name.trim() || null,
  tagline: draft.tagline.trim() || null,
  bio: draft.bio.trim() || null,
  hero_image_url: draft.hero_image_url || null,
  contact_phone: draft.contact_phone.trim() || null,
  contact_email: draft.contact_email.trim() || null,
  contact_whatsapp: draft.contact_whatsapp.trim() || null,
  social_links: Object.fromEntries(Object.entries({
    website: draft.social_website.trim(),
    instagram: draft.social_instagram.trim(),
    youtube: draft.social_youtube.trim(),
  }).filter(([, v]) => v)),
  subjects: draft.subjects.split(',').map(s => s.trim()).filter(Boolean).slice(0, 12),
  theme: {
    accent: draft.accent,
    ...(draft.cover_image_url ? { cover_image_url: draft.cover_image_url } : {}),
  },
  status: saved?.status ?? 'draft',
  published_at: saved?.published_at ?? null,
  preview_token: saved?.preview_token ?? '00000000-0000-0000-0000-000000000000',
  view_count: saved?.view_count ?? 0,
  created_at: saved?.created_at ?? new Date().toISOString(),
  updated_at: saved?.updated_at ?? new Date().toISOString(),
});

const newTempId = (): string =>
  `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Teacher Page builder (/teacher-page) — a vertical, phone-first editor for
 * the public portfolio page. Sections are collapsible cards; images are
 * compressed + uploaded immediately; the draft autosaves; a device-frame
 * preview renders the EXACT public page; publishing runs a checklist and
 * hands out the public link, share, and a poster QR code.
 */
export const TeacherPageBuilder: React.FC = () => {
  const navigate = useNavigate();
  const teacher = getTeacherSession();

  const [loading, setLoading] = useState(true);
  const [savedPage, setSavedPage] = useState<TeacherPage | null>(null);
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [media, setMedia] = useState<TeacherPageMedia[]>([]);
  // Full batch list for the management section (active + inactive), plus
  // per-batch stats and the id of a batch whose visibility is being toggled.
  const [allBatches, setAllBatches] = useState<BatchRow[]>([]);
  const [batchStats, setBatchStats] = useState<Record<string, { members: number | null; pending: number | null }>>({});
  const [togglingBatchId, setTogglingBatchId] = useState<string | null>(null);

  const [slugCheck, setSlugCheck] = useState<SlugCheckResult | null>(null);
  const [slugChecking, setSlugChecking] = useState(false);

  const [open, setOpen] = useState<Record<SectionKey, boolean>>({
    slug: true, hero: true, about: false, achievements: false, classroom: false, batches: false, contact: false,
  });

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const [uploadingKind, setUploadingKind] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [previewMode, setPreviewMode] = useState<PreviewMode>('edit');
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishedSheet, setPublishedSheet] = useState<{ url: string; previewUrl: string } | null>(null);

  // Desktop preview: a fixed-width canvas scaled down to fit the available
  // width (zoom keeps layout + box size in sync), so the TRUE desktop rendering
  // is shown even when the teacher is on a phone.
  const desktopCanvasRef = useRef<HTMLDivElement>(null);
  const [desktopScale, setDesktopScale] = useState(1);

  useEffect(() => {
    if (previewMode !== 'desktop') return;
    const el = desktopCanvasRef.current;
    if (!el) return;
    const compute = () => {
      const available = el.clientWidth;
      if (available > 0) setDesktopScale(Math.min(1, available / DESKTOP_FRAME_WIDTH));
    };
    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(el);
    return () => { observer.disconnect(); };
  }, [previewMode]);

  const heroFileRef = useRef<HTMLInputElement>(null);
  const coverFileRef = useRef<HTMLInputElement>(null);
  const galleryFileRefs = useRef<{ achievement?: HTMLInputElement | null; classroom?: HTMLInputElement | null }>({});

  // The public page (and the preview) lists ACTIVE batches only — deactivating
  // a batch below removes it from the funnel without deleting anything.
  const batches = useMemo<PublicBatchCard[]>(() => allBatches
    .filter(b => b.is_active)
    .map(b => ({ id: b.id, code: b.code, name: b.name, description: b.description })),
  [allBatches]);

  const isPublished = savedPage?.status === 'published';
  const slugFrozen = isPublished;

  // ---- Initial load --------------------------------------------------------
  useEffect(() => {
    if (!teacher) { navigate('/login'); return; }
    let cancelled = false;
    (async () => {
      try {
        const [mine, myBatches] = await Promise.all([
          getMyTeacherPage().catch(err => { setError(toErrorMessage(err)); return null; }),
          getBatchesForTeacher().catch(() => [] as BatchRow[]),
        ]);
        if (cancelled) return;
        setAllBatches(myBatches as BatchRow[]);
        if (mine?.page) {
          setSavedPage(mine.page);
          setDraft(toDraft(mine.page));
          setMedia(mine.media);
        } else {
          // Pre-fill the slug from the teacher's name / username.
          const suggested = normalizeSlugInput(teacher.name || teacher.username || '');
          setDraft(d => ({ ...d, slug: suggested, display_name: teacher.name || d.display_name }));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Debounced slug availability check -----------------------------------
  useEffect(() => {
    if (slugFrozen) return;
    const slug = normalizeSlugInput(draft.slug);
    const problem = slugProblem(slug);
    if (problem) {
      setSlugCheck({ available: false, reason: problem, suggestions: [] });
      return;
    }
    if (savedPage && slug === savedPage.slug) {
      setSlugCheck({ available: true, reason: 'own', suggestions: [] });
      return;
    }
    setSlugChecking(true);
    const timer = setTimeout(async () => {
      try {
        setSlugCheck(await checkSlugAvailability(slug));
      } catch {
        setSlugCheck({ available: true, reason: 'unverified', suggestions: [] });
      } finally {
        setSlugChecking(false);
      }
    }, 500);
    return () => { clearTimeout(timer); };
  }, [draft.slug, slugFrozen, savedPage]);

  const markDirty = () => setDirty(true);

  const update = (patch: Partial<DraftState>) => {
    setDraft(d => ({ ...d, ...patch }));
    markDirty();
  };

  // ---- Per-batch management stats (members + pending approvals) -----------
  useEffect(() => {
    if (allBatches.length === 0) return;
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(allBatches.map(async b => {
        try {
          const [students, pendingRows] = await Promise.all([
            getStudentsInBatch(b.id),
            getPendingEnrollments(b.id),
          ]);
          return [b.id, { members: students.length, pending: pendingRows.length }] as const;
        } catch {
          return [b.id, { members: null, pending: null }] as const;
        }
      }));
      if (!cancelled) setBatchStats(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
  }, [allBatches]);

  /** Show/hide a batch on the public page (persisted via app_update_batch). */
  const toggleBatchActive = async (batch: BatchRow) => {
    setTogglingBatchId(batch.id);
    try {
      const updated = await updateBatch(batch.id, { isActive: !batch.is_active });
      setAllBatches(prev => prev.map(b => (b.id === batch.id ? updated : b)));
      notifySuccess(updated.is_active
        ? `“${updated.name}” is now visible on your public page.`
        : `“${updated.name}” is hidden from your public page.`);
    } catch (err) {
      notifyError(toErrorMessage(err));
    } finally {
      setTogglingBatchId(null);
    }
  };

  // ---- Save (page + media), autosave, guards -------------------------------
  const saveDraft = useCallback(async (): Promise<TeacherPage | null> => {
    if (!teacher) return null;
    setSaving(true);
    setError(null);
    try {
      const saved = await saveTeacherPage({
        slug: draft.slug,
        display_name: draft.display_name,
        coaching_name: draft.coaching_name,
        tagline: draft.tagline,
        bio: draft.bio,
        hero_image_url: draft.hero_image_url,
        contact_phone: draft.contact_phone,
        contact_email: draft.contact_email,
        contact_whatsapp: draft.contact_whatsapp,
        social_links: Object.fromEntries(Object.entries({
          website: draft.social_website.trim(),
          instagram: draft.social_instagram.trim(),
          youtube: draft.social_youtube.trim(),
        }).filter(([, v]) => v)),
        subjects: draft.subjects.split(',').map(s => s.trim()).filter(Boolean).slice(0, 12),
        theme: {
          accent: draft.accent,
          ...(draft.cover_image_url ? { cover_image_url: draft.cover_image_url } : {}),
        },
      });
      await setPageMedia(media.map((m, i) => ({ ...m, sort_order: i })));
      setSavedPage(saved);
      setDirty(false);
      setSavedTick(true);
      setTimeout(() => setSavedTick(false), 2000);
      return saved;
    } catch (err) {
      const message = toErrorMessage(err);
      setError(message);
      notifyError(message);
      return null;
    } finally {
      setSaving(false);
    }
  }, [draft, media, teacher]);

  // Autosave every 10s while dirty.
  useEffect(() => {
    if (!dirty || saving) return;
    const timer = setTimeout(() => { void saveDraft(); }, 10_000);
    return () => { clearTimeout(timer); };
  }, [dirty, saving, saveDraft]);

  // Warn on tab close while there are unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const goBack = async () => {
    if (dirty && !window.confirm('You have unsaved changes. Leave without saving?')) return;
    navigate('/dashboard');
  };

  // ---- Uploads -------------------------------------------------------------
  const uploadHero = async (file: File) => {
    if (!teacher) return;
    setUploadingKind('hero');
    setError(null);
    try {
      const { blob } = await compressImage(file);
      const asFile = new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
      const { publicUrl } = await uploadTeacherPageImage(asFile, 'hero', teacher.id);
      update({ hero_image_url: publicUrl });
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Image upload failed.');
    } finally {
      setUploadingKind(null);
    }
  };

  const uploadCover = async (file: File) => {
    if (!teacher) return;
    setUploadingKind('cover');
    setError(null);
    try {
      const { blob } = await compressImage(file);
      const asFile = new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
      const { publicUrl } = await uploadTeacherPageImage(asFile, 'cover', teacher.id);
      update({ cover_image_url: publicUrl });
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Image upload failed.');
    } finally {
      setUploadingKind(null);
    }
  };

  const uploadGalleryImage = async (kind: TeacherPageMedia['kind'], file: File) => {
    if (!teacher) return;
    const stamp = `${kind}-${Date.now()}`;
    setUploadingKind(stamp);
    setError(null);
    try {
      if (media.length >= 24) throw new Error('A page can hold at most 24 images.');
      const { blob } = await compressImage(file);
      const asFile = new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
      const { path } = await uploadTeacherPageImage(asFile, kind, teacher.id);
      setMedia(prev => [...prev, {
        id: newTempId(), kind, storage_path: path, caption: '', alt_text: '', sort_order: prev.length,
      }]);
      setDirty(true);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Image upload failed.');
    } finally {
      setUploadingKind(null);
    }
  };

  const moveMedia = (index: number, direction: -1 | 1) => {
    setMedia(prev => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setDirty(true);
  };

  const removeMedia = (id: string) => {
    setMedia(prev => prev.filter(m => m.id !== id));
    setDirty(true);
  };

  const patchMedia = (id: string, patch: Partial<TeacherPageMedia>) => {
    setMedia(prev => prev.map(m => (m.id === id ? { ...m, ...patch } : m)));
    setDirty(true);
  };

  // ---- Publish flow --------------------------------------------------------
  const slugReady = slugCheck?.available === true
    && normalizeSlugInput(draft.slug).length >= 3;
  const nameReady = draft.display_name.trim().length > 0;
  const contentReady = Boolean(
    draft.bio.trim() || draft.tagline.trim() || media.length > 0 || draft.hero_image_url,
  );
  const checklist = [
    { ok: slugReady, label: 'Page address claimed and valid' },
    { ok: nameReady, label: 'Display name added' },
    { ok: contentReady, label: 'At least one section has content' },
  ];

  const doPublish = async (status: 'draft' | 'published') => {
    setPublishing(true);
    setError(null);
    try {
      const saved = dirty ? await saveDraft() : savedPage;
      if (!saved) throw new Error('Save your page before publishing.');
      const updated = await publishTeacherPage(status);
      setSavedPage(updated);
      setDirty(false);
      if (status === 'published') {
        const url = `${window.location.origin}/t/${updated.slug}`;
        setPublishedSheet({
          url,
          previewUrl: `${window.location.origin}/t/${updated.slug}?preview=${updated.preview_token}`,
        });
        setPublishOpen(false);
        notifySuccess('Your page is live! Share the link with your students.');
      } else {
        setPublishOpen(false);
        notifySuccess('Page unpublished — students can no longer open it.');
      }
    } catch (err) {
      const message = toErrorMessage(err);
      setError(message);
      notifyError(message);
    } finally {
      setPublishing(false);
    }
  };

  const copyWithToast = async (text: string, label: string) => {
    if (await copyTextToClipboard(text)) notifySuccess(`${label} copied.`);
    else notifyError(`Could not copy — long-press to select: ${text}`);
  };

  const previewPage = useMemo(() => draftToPage(draft, savedPage), [draft, savedPage]);

  // ---- Loading / guard states ----------------------------------------------
  if (!teacher) { navigate('/login'); return null; }

  if (loading) {
    return (
      <div className="tpb-shell" role="status" aria-busy="true">
        <div className="tpb-header">
          <button onClick={goBack} className="tpb-btn-ghost">← Dashboard</button>
          <h1>My Page</h1>
        </div>
        <SkeletonList rows={5} />
      </div>
    );
  }

  return (
    <div className="tpb-shell">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="tpb-header">
        <button onClick={goBack} className="tpb-btn-ghost">← Dashboard</button>
        <h1>My Page</h1>
        <div className="tpb-header-status">
          <span className={`tpb-status-chip ${isPublished ? 'is-live' : ''}`}>
            {isPublished ? <>Live</> : 'Draft'}
          </span>
          {saving ? (
            <span className="tpb-save-state"><Loader2 size={13} className="animate-spin" /> Saving…</span>
          ) : savedTick ? (
            <span className="tpb-save-state is-saved"><Check size={13} /> Saved</span>
          ) : dirty ? (
            <span className="tpb-save-state">Unsaved changes</span>
          ) : null}
        </div>
      </div>

      {isPublished && savedPage ? (
        <div className="tpb-live-banner">
          <BadgeCheck size={15} />
          <span className="tpb-live-url">mockmate.app/t/<b>{savedPage.slug}</b></span>
          {/* No visit counter — the number is not tracked reliably, and a
              wrong count is worse than none. */}
          <button onClick={() => copyWithToast(`${window.location.origin}/t/${savedPage.slug}`, 'Page link')} className="tpb-btn-ghost"><Copy size={13} /> Copy link</button>
        </div>
      ) : null}

      {error ? <div className="tpb-error"><AlertCircle size={14} /> {error}</div> : null}

      {/* ── Preview mode toggle ────────────────────────────────────────── */}
      <div className="tpb-preview-toggle" role="tablist" aria-label="Editor or preview">
        <button role="tab" aria-selected={previewMode === 'edit'}
          className={`tpb-toggle-btn ${previewMode === 'edit' ? 'is-active' : ''}`}
          onClick={() => setPreviewMode('edit')}>
          <Camera size={14} /> Edit
        </button>
        <button role="tab" aria-selected={previewMode === 'phone'}
          className={`tpb-toggle-btn ${previewMode === 'phone' ? 'is-active' : ''}`}
          onClick={() => setPreviewMode('phone')}>
          <Smartphone size={14} /> Phone
        </button>
        <button role="tab" aria-selected={previewMode === 'desktop'}
          className={`tpb-toggle-btn ${previewMode === 'desktop' ? 'is-active' : ''}`}
          onClick={() => setPreviewMode('desktop')}>
          <Monitor size={14} /> Desktop
        </button>
      </div>

      {/* ── Device-frame preview (exact public renderer) ───────────── */}
      {previewMode === 'phone' ? (
        <div className="tpb-preview-frame tpb-frame-phone">
          <div className="tpb-device-chrome tpb-chrome-phone" aria-hidden="true">
            <span className="tpb-notch" />
          </div>
          <div className="tpb-frame-body">
            {/* "Preview mode" banner only while the page is still a draft —
                a LIVE page must not claim it is not public. */}
            <TeacherPageView page={previewPage} media={media} batches={batches} preview={!isPublished} />
          </div>
        </div>
      ) : previewMode === 'desktop' ? (
        <div className="tpb-desktop-canvas" ref={desktopCanvasRef}>
          <div className="tpb-desktop-scaler" style={{ zoom: desktopScale } as React.CSSProperties}>
            <div className="tpb-preview-frame tpb-frame-desktop" style={{ width: DESKTOP_FRAME_WIDTH }}>
              <div className="tpb-device-chrome tpb-chrome-desktop" aria-hidden="true">
                <span className="tpb-dot" />
                <span className="tpb-dot" />
                <span className="tpb-dot" />
                <span className="tpb-chrome-url">mockmate.app/t/{previewPage.slug || 'your-page'}</span>
              </div>
              <div className="tpb-frame-body">
                <TeacherPageView page={previewPage} media={media} batches={batches} preview={!isPublished} />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* ── Section: Address (slug) ─────────────────────────── */}
          <section className="tpb-card">
            <button type="button" className="tpb-card-head" onClick={() => setOpen(o => ({ ...o, slug: !o.slug }))}>
              <Globe size={16} />
              <span>Page address</span>
              {open.slug ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {open.slug ? (
              <div className="tpb-card-body">
                <label className="tpb-field">
                  <span className="tpb-field-label">Your page address</span>
                  <div className="tpb-slug-row">
                    <span className="tpb-slug-prefix">/t/</span>
                    <input
                      value={draft.slug}
                      onChange={e => update({ slug: e.target.value })}
                      onBlur={() => update({ slug: normalizeSlugInput(draft.slug) })}
                      placeholder="sharma-classes"
                      disabled={slugFrozen}
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck={false}
                    />
                  </div>
                </label>
                {slugFrozen ? (
                  <p className="tpb-hint"><BadgeCheck size={13} /> The address is frozen while your page is published (links stay stable). Unpublish to change it.</p>
                ) : (
                  <div className="tpb-slug-status" aria-live="polite">
                    {slugChecking ? (
                      <span className="tpb-hint"><Loader2 size={13} className="animate-spin" /> Checking availability…</span>
                    ) : slugCheck ? (
                      slugCheck.available ? (
                        <span className="tpb-hint is-ok"><Check size={13} /> {slugCheck.reason === 'own' ? 'This is your current address.' : 'mockmate.app/t/' + normalizeSlugInput(draft.slug) + ' is available!'}</span>
                      ) : (
                        <div className="tpb-hint is-bad">
                          {/* Unavailable results can only carry real problems
                              ('own'/'unverified' both mean available). */}
                          <span><X size={13} /> {slugErrorText((slugCheck.reason ?? 'taken') as SlugProblem)}</span>
                          {slugCheck.suggestions.length > 0 ? (
                            <div className="tpb-slug-suggestions">
                              {slugCheck.suggestions.map(s => (
                                <button key={s} type="button" onClick={() => update({ slug: s })}>{s}</button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      )
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}
          </section>

          {/* ── Section: Hero ───────────────────────────────────────── */}
          <section className="tpb-card">
            <button type="button" className="tpb-card-head" onClick={() => setOpen(o => ({ ...o, hero: !o.hero }))}>
              <BadgeCheck size={16} />
              <span>Hero & identity</span>
              {open.hero ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {open.hero ? (
              <div className="tpb-card-body">
                {/* Profile photo + identity first; the cover banner sits under it. */}
                <div className="tpb-hero-edit">
                  <div className="tpb-hero-photo-edit">
                    {draft.hero_image_url
                      ? <img src={draft.hero_image_url} alt="Hero preview" />
                      : <span className="tpb-hero-photo-empty"><Camera size={22} /></span>}
                    <button type="button" className="tpb-btn-ghost" disabled={uploadingKind === 'hero'}
                      onClick={() => heroFileRef.current?.click()}>
                      {uploadingKind === 'hero' ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />} Photo
                    </button>
                    {draft.hero_image_url ? (
                      <button type="button" className="tpb-btn-ghost is-danger" onClick={() => update({ hero_image_url: '' })}>
                        <Trash2 size={13} />
                      </button>
                    ) : null}
                    <input ref={heroFileRef} type="file" accept="image/*" hidden
                      onChange={e => { const f = e.target.files?.[0]; if (f) void uploadHero(f); e.target.value = ''; }} />
                  </div>
                  <div className="tpb-fields">
                    <label className="tpb-field">
                      <span className="tpb-field-label">Display name *</span>
                      <input value={draft.display_name} onChange={e => update({ display_name: e.target.value })} placeholder="Ravi Sharma" maxLength={80} />
                    </label>
                    <label className="tpb-field">
                      <span className="tpb-field-label">Coaching / institute name</span>
                      <input value={draft.coaching_name} onChange={e => update({ coaching_name: e.target.value })} placeholder="Sharma Classes" />
                    </label>
                    <label className="tpb-field">
                      <span className="tpb-field-label">Tagline</span>
                      <input value={draft.tagline} onChange={e => update({ tagline: e.target.value })} placeholder="Physics that finally makes sense" maxLength={120} />
                    </label>
                    <label className="tpb-field">
                      <span className="tpb-field-label">Subjects (comma separated)</span>
                      <input value={draft.subjects} onChange={e => update({ subjects: e.target.value })} placeholder="Physics, Chemistry, Maths" />
                    </label>
                    <label className="tpb-field">
                      <span className="tpb-field-label">Accent color</span>
                      <input type="color" value={draft.accent} onChange={e => update({ accent: e.target.value })} className="tpb-color" />
                    </label>
                  </div>
                </div>
                <div className="tpb-cover-edit">
                  <span className="tpb-field-label">Cover photo</span>
                  <div className={`tpb-cover-preview ${draft.cover_image_url ? '' : 'is-empty'}`}>
                    {draft.cover_image_url ? (
                      <img src={draft.cover_image_url} alt="Cover preview" />
                    ) : (
                      <span><ImagePlus size={18} /> No cover yet — the accent gradient shows instead.</span>
                    )}
                  </div>
                  <div className="tpb-cover-actions">
                    <button
                      type="button"
                      className="tpb-btn-ghost"
                      disabled={uploadingKind === 'cover'}
                      onClick={() => coverFileRef.current?.click()}
                    >
                      {uploadingKind === 'cover' ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
                      {draft.cover_image_url ? 'Change cover' : 'Add cover photo'}
                    </button>
                    {draft.cover_image_url ? (
                      <button
                        type="button"
                        className="tpb-btn-ghost is-danger"
                        onClick={() => update({ cover_image_url: '' })}
                        title="Remove cover photo"
                      >
                        <Trash2 size={13} /> Remove
                      </button>
                    ) : null}
                  </div>
                  <input
                    ref={coverFileRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={e => { const f = e.target.files?.[0]; if (f) void uploadCover(f); e.target.value = ''; }}
                  />
                </div>
              </div>
            ) : null}
          </section>

          {/* ── Section: About ──────────────────────────────────────── */}
          <section className="tpb-card">
            <button type="button" className="tpb-card-head" onClick={() => setOpen(o => ({ ...o, about: !o.about }))}>
              <Users size={16} />
              <span>About & philosophy</span>
              {open.about ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {open.about ? (
              <div className="tpb-card-body">
                <label className="tpb-field">
                  <span className="tpb-field-label">Bio</span>
                  <textarea value={draft.bio} onChange={e => update({ bio: e.target.value })}
                    placeholder="Introduce yourself, your teaching philosophy, experience, languages you teach in…"
                    rows={6} maxLength={4000} />
                  <span className="tpb-char-count">{draft.bio.length}/4000</span>
                </label>
              </div>
            ) : null}
          </section>

          {/* ── Section: Achievements ───────────────────────────────── */}
          <section className="tpb-card">
            <button type="button" className="tpb-card-head" onClick={() => setOpen(o => ({ ...o, achievements: !o.achievements }))}>
              <BadgeCheck size={16} />
              <span>Achievements gallery ({media.filter(m => m.kind === 'achievement').length})</span>
              {open.achievements ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {open.achievements ? (
              <div className="tpb-card-body">
                <div className="tpb-media-list">
                  {media.map((m, i) => m.kind === 'achievement' ? (
                    <div key={m.id} className="tpb-media-item">
                      <img className="tpb-media-thumb" src={publicUrlForPath(m.storage_path)} alt={m.alt_text || m.caption || ''} loading="lazy" />
                      <div className="tpb-media-fields">
                        <input value={m.caption ?? ''} onChange={e => patchMedia(m.id, { caption: e.target.value })} placeholder="Caption (e.g. Toppers 2025)" maxLength={300} />
                        <input value={m.alt_text ?? ''} onChange={e => patchMedia(m.id, { alt_text: e.target.value })} placeholder="Describe this image for accessibility" maxLength={300} />
                      </div>
                      <div className="tpb-media-actions">
                        <button type="button" onClick={() => moveMedia(i, -1)} disabled={i === 0} aria-label="Move up"><ArrowUp size={14} /></button>
                        <button type="button" onClick={() => moveMedia(i, 1)} disabled={i === media.length - 1 || media[i + 1]?.kind !== 'achievement'} aria-label="Move down"><ArrowDown size={14} /></button>
                        <button type="button" onClick={() => removeMedia(m.id)} className="is-danger" aria-label="Remove"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ) : null)}
                </div>
                <button type="button" className="tpb-btn-ghost tpb-add-media" disabled={uploadingKind !== null}
                  onClick={() => galleryFileRefs.current.achievement?.click()}>
                  {uploadingKind?.startsWith('achievement') ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />} Add achievement image
                </button>
                <input ref={el => { galleryFileRefs.current.achievement = el; }} type="file" accept="image/*" hidden
                  onChange={e => { const f = e.target.files?.[0]; if (f) void uploadGalleryImage('achievement', f); e.target.value = ''; }} />
                <p className="tpb-hint">Results posters, awards, topper cards — up to 24 images across both galleries. Images are compressed automatically.</p>
              </div>
            ) : null}
          </section>

          {/* ── Section: Classroom ──────────────────────────────────── */}
          <section className="tpb-card">
            <button type="button" className="tpb-card-head" onClick={() => setOpen(o => ({ ...o, classroom: !o.classroom }))}>
              <Camera size={16} />
              <span>Classroom photos ({media.filter(m => m.kind === 'classroom').length})</span>
              {open.classroom ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {open.classroom ? (
              <div className="tpb-card-body">
                <div className="tpb-media-list">
                  {media.map((m, i) => m.kind === 'classroom' ? (
                    <div key={m.id} className="tpb-media-item">
                      <img className="tpb-media-thumb" src={publicUrlForPath(m.storage_path)} alt={m.alt_text || m.caption || ''} loading="lazy" />
                      <div className="tpb-media-fields">
                        <input value={m.caption ?? ''} onChange={e => patchMedia(m.id, { caption: e.target.value })} placeholder="Caption (e.g. Our study hall)" maxLength={300} />
                        <input value={m.alt_text ?? ''} onChange={e => patchMedia(m.id, { alt_text: e.target.value })} placeholder="Describe this image for accessibility" maxLength={300} />
                      </div>
                      <div className="tpb-media-actions">
                        <button type="button" onClick={() => moveMedia(i, -1)} disabled={i === 0 || media[i - 1]?.kind !== 'classroom'} aria-label="Move up"><ArrowUp size={14} /></button>
                        <button type="button" onClick={() => moveMedia(i, 1)} disabled={i === media.length - 1 || media[i + 1]?.kind !== 'classroom'} aria-label="Move down"><ArrowDown size={14} /></button>
                        <button type="button" onClick={() => removeMedia(m.id)} className="is-danger" aria-label="Remove"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ) : null)}
                </div>
                <button type="button" className="tpb-btn-ghost tpb-add-media" disabled={uploadingKind !== null}
                  onClick={() => galleryFileRefs.current.classroom?.click()}>
                  {uploadingKind?.startsWith('classroom') ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />} Add classroom photo
                </button>
                <input ref={el => { galleryFileRefs.current.classroom = el; }} type="file" accept="image/*" hidden
                  onChange={e => { const f = e.target.files?.[0]; if (f) void uploadGalleryImage('classroom', f); e.target.value = ''; }} />
              </div>
            ) : null}
          </section>

          {/* ── Section: Batches (management — controls the public funnel) ── */}
          <section className="tpb-card">
            <button type="button" className="tpb-card-head" onClick={() => setOpen(o => ({ ...o, batches: !o.batches }))}>
              <Users size={16} />
              <span>Batches on your page ({batches.length} of {allBatches.length} shown)</span>
              {open.batches ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {open.batches ? (
              <div className="tpb-card-body">
                <p className="tpb-hint">Only <b>active</b> batches appear on your public page with their join code. Toggle a batch off to hide it from visitors without deleting anything.</p>
                {allBatches.length === 0 ? (
                  <p className="tpb-hint">No batches yet. Create one from the Batches screen — your public page lists every active batch with its join code automatically.</p>
                ) : (
                  <div className="tpb-batch-preview">
                    {allBatches.map(b => {
                      const stat = batchStats[b.id];
                      const busy = togglingBatchId === b.id;
                      return (
                        <div key={b.id} className={`tpb-batch-row ${b.is_active ? '' : 'is-inactive'}`}>
                          <div className="tpb-batch-info">
                            <div className="tpb-batch-name">
                              {b.name}
                              {!b.is_active ? <span className="tpb-batch-off-chip">Hidden</span> : null}
                            </div>
                            <div className="tpb-batch-code">Join code: <code>{b.code}</code></div>
                            <div className="tpb-batch-stats">
                              <span><Users size={12} /> {stat ? (stat.members ?? '—') : '…'} member{(stat?.members ?? 0) === 1 ? '' : 's'}</span>
                              {stat?.pending ? (
                                <span className="tpb-batch-pending"><Mail size={11} /> {stat.pending} pending approval</span>
                              ) : null}
                            </div>
                          </div>
                          <div className="tpb-batch-actions">
                            <button type="button" className="tpb-batch-icon-btn" title="Copy join code"
                              onClick={() => void copyWithToast(b.code, 'Join code')}>
                              <Copy size={14} />
                            </button>
                            <button type="button" className="tpb-batch-icon-btn" title="Open batch management"
                              onClick={() => navigate(`/batches/${b.code}`)}>
                              <ExternalLink size={14} />
                            </button>
                            <button type="button" role="switch" aria-checked={b.is_active}
                              className={`tpb-batch-switch ${b.is_active ? 'is-on' : ''}`}
                              title={b.is_active ? 'Visible on your page — click to hide' : 'Hidden from your page — click to show'}
                              disabled={busy}
                              onClick={() => void toggleBatchActive(b)}>
                              {busy
                                ? <Loader2 size={13} className="animate-spin" />
                                : <span className="tpb-batch-switch-knob" />}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}
          </section>

          {/* ── Section: Contact ────────────────────────────────────── */}
          <section className="tpb-card">
            <button type="button" className="tpb-card-head" onClick={() => setOpen(o => ({ ...o, contact: !o.contact }))}>
              <Phone size={16} />
              <span>Contact & social</span>
              {open.contact ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {open.contact ? (
              <div className="tpb-card-body">
                <div className="tpb-fields">
                  <label className="tpb-field">
                    <span className="tpb-field-label"><Phone size={12} /> Phone</span>
                    <input value={draft.contact_phone} onChange={e => update({ contact_phone: e.target.value })} placeholder="+91 98765 43210" inputMode="tel" />
                  </label>
                  <label className="tpb-field">
                    <span className="tpb-field-label"><MessageCircle size={12} /> WhatsApp number</span>
                    <input value={draft.contact_whatsapp} onChange={e => update({ contact_whatsapp: e.target.value })} placeholder="919876543210" inputMode="numeric" />
                  </label>
                  <label className="tpb-field">
                    <span className="tpb-field-label"><Mail size={12} /> Email</span>
                    <input value={draft.contact_email} onChange={e => update({ contact_email: e.target.value })} placeholder="you@example.com" inputMode="email" />
                  </label>
                  <label className="tpb-field">
                    <span className="tpb-field-label"><Instagram size={12} /> Instagram URL</span>
                    <input value={draft.social_instagram} onChange={e => update({ social_instagram: e.target.value })} placeholder="https://instagram.com/…" inputMode="url" />
                  </label>
                  <label className="tpb-field">
                    <span className="tpb-field-label"><Youtube size={12} /> YouTube URL</span>
                    <input value={draft.social_youtube} onChange={e => update({ social_youtube: e.target.value })} placeholder="https://youtube.com/@…" inputMode="url" />
                  </label>
                  <label className="tpb-field">
                    <span className="tpb-field-label"><Globe size={12} /> Website</span>
                    <input value={draft.social_website} onChange={e => update({ social_website: e.target.value })} placeholder="https://…" inputMode="url" />
                  </label>
                </div>
              </div>
            ) : null}
          </section>
        </>
      )}

      {/* ── Bottom action bar ──────────────────────────────────────────── */}
      <div className="tpb-action-bar">
        <button onClick={() => void saveDraft()} disabled={saving} className="tpb-btn-ghost">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
        </button>
        <div className="tpb-action-spacer" />
        {savedPage ? (
          <button onClick={() => copyWithToast(`${window.location.origin}/t/${savedPage.slug}${savedPage.status === 'published' ? '' : `?preview=${savedPage.preview_token}`}`, 'Link')} className="tpb-btn-ghost">
            <Share2 size={14} /> {isPublished ? 'Share link' : 'Preview link'}
          </button>
        ) : null}
        {isPublished ? (
          <button onClick={() => void doPublish('draft')} disabled={publishing} className="tpb-btn-danger">
            <EyeOff size={14} /> Unpublish
          </button>
        ) : (
          <button onClick={() => setPublishOpen(true)} disabled={publishing} className="tpb-btn-primary">
            <Rocket size={14} /> Go live
          </button>
        )}
      </div>

      {/* ── Publish checklist modal ────────────────────────────────────── */}
      {publishOpen ? (
        <div className="tpb-modal-overlay" role="dialog" aria-modal="true" onClick={() => setPublishOpen(false)}>
          <div className="tpb-modal" onClick={e => e.stopPropagation()}>
            <div className="tpb-modal-head">
              <h3>Ready to go live?</h3>
              <button onClick={() => setPublishOpen(false)} className="tpb-btn-ghost" aria-label="Close"><X size={15} /></button>
            </div>
            <ul className="tpb-checklist">
              {checklist.map(item => (
                <li key={item.label} className={item.ok ? 'is-ok' : 'is-pending'}>
                  {item.ok ? <Check size={15} /> : <X size={15} />} {item.label}
                </li>
              ))}
            </ul>
            {!checklist.every(c => c.ok) ? (
              <p className="tpb-hint">Complete the pending items first — your page will be saved automatically when you publish.</p>
            ) : null}
            <button onClick={() => void doPublish('published')} disabled={publishing || !checklist.every(c => c.ok)}
              className="tpb-btn-primary tpb-publish-cta">
              {publishing ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />} Publish my page
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Publish success sheet ──────────────────────────────────────── */}
      {publishedSheet ? (
        <div className="tpb-modal-overlay" role="dialog" aria-modal="true" onClick={() => setPublishedSheet(null)}>
          <div className="tpb-modal tpb-success-sheet" onClick={e => e.stopPropagation()}>
            <div className="tpb-modal-head">
              <h3>Your page is live!</h3>
              <button onClick={() => setPublishedSheet(null)} className="tpb-btn-ghost" aria-label="Close"><X size={15} /></button>
            </div>
            <p className="tpb-hint">Share this link and QR with students and parents — it opens your public page.</p>
            <div className="tpb-success-body">
              <div className="tpb-qr">
                <QRCodeCanvas value={publishedSheet.url} size={148} includeMargin />
                <span>Scan to open</span>
              </div>
              <div className="tpb-success-actions">
                <code className="tpb-success-url">{publishedSheet.url}</code>
                <button onClick={() => copyWithToast(publishedSheet.url, 'Page link')} className="tpb-btn-ghost"><Copy size={13} /> Copy link</button>
                <button onClick={() => { void navigator.share?.({ title: 'My MockMate page', url: publishedSheet.url }).catch(() => {}); }} className="tpb-btn-ghost">
                  <Share2 size={13} /> Share…
                </button>
                <button onClick={() => copyWithToast(publishedSheet.previewUrl, 'Preview link')} className="tpb-btn-ghost is-subtle">
                  <Eye size={13} /> Copy preview link
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default TeacherPageBuilder;

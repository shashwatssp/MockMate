import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Phone, Mail, MessageCircle, Users, Award, Camera, Copy,
  ExternalLink, Eye, X, Globe, Instagram, Youtube, Share2, BadgeCheck,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { publicUrlForPath } from '../lib/teacherPage';
import type { PublicBatchCard, TeacherPage, TeacherPageMedia } from '../lib/teacherPage';
import { copyTextToClipboard, notifySuccess } from '../lib/shareToast';
import './TeacherPagePublic.css';

const SOCIAL_ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  instagram: Instagram,
  youtube: Youtube,
  website: Globe,
  site: Globe,
  facebook: Globe,
};

const initials = (name: string): string =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || 'T';

export interface TeacherPageViewProps {
  page: TeacherPage;
  media: TeacherPageMedia[];
  batches: PublicBatchCard[];
  /** Renders the "not public yet" banner (draft preview / builder). */
  preview?: boolean;
}

/**
 * Presentational Teacher Page — the shared renderer used by BOTH the public
 * route (/t/<slug>) and the builder's device-frame preview, so what the
 * teacher edits is pixel-identical to what visitors see.
 */
export const TeacherPageView: React.FC<TeacherPageViewProps> = ({
  page,
  media,
  batches,
  preview = false,
}) => {
  // Lightbox = position within one of the two galleries, so prev/next can
  // step through that gallery cyclically.
  const [lightbox, setLightbox] = useState<{ kind: TeacherPageMedia['kind']; index: number } | null>(null);
  const accent = page.theme?.accent ?? '#6366f1';
  // Optional hero cover photo — rides the free-form theme jsonb, so it needs
  // no dedicated column/RPC.
  const coverImageUrl = typeof page.theme?.cover_image_url === 'string' ? page.theme.cover_image_url : '';

  const achievements = useMemo(() => media.filter(m => m.kind === 'achievement'), [media]);
  const classroom = useMemo(() => media.filter(m => m.kind === 'classroom'), [media]);
  const lightboxList = lightbox ? (lightbox.kind === 'achievement' ? achievements : classroom) : [];
  const lightboxItem = lightbox ? lightboxList[lightbox.index] : undefined;

  const stepLightbox = (dir: 1 | -1) => {
    setLightbox(cur => {
      if (!cur) return cur;
      const list = cur.kind === 'achievement' ? achievements : classroom;
      if (list.length === 0) return cur;
      return { ...cur, index: (cur.index + dir + list.length) % list.length };
    });
  };

  // Keyboard controls while the lightbox is open: Esc closes, arrows navigate.
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
      else if (e.key === 'ArrowRight') stepLightbox(1);
      else if (e.key === 'ArrowLeft') stepLightbox(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Public tab title mirrors the page identity; skipped in builder preview so
  // the teacher's own tab title is never hijacked by the frame.
  useEffect(() => {
    if (preview) return;
    const previous = document.title;
    document.title = `${page.display_name} | MockMate teacher`;
    return () => { document.title = previous; };
  }, [page.display_name, preview]);

  const whatsappHref = page.contact_whatsapp
    ? `https://wa.me/${page.contact_whatsapp.replace(/[^0-9]/g, '')}`
    : null;

  const copyBatchCode = async (code: string) => {
    if (await copyTextToClipboard(code)) notifySuccess(`Join code ${code} copied.`);
  };

  const sharePage = async () => {
    const url = `${window.location.origin}/t/${page.slug}`;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: page.display_name, url });
        return;
      } catch { /* dismissed — fall through to clipboard */ }
    }
    if (await copyTextToClipboard(url)) notifySuccess('Page link copied to your clipboard.');
    else notifySuccess(`Share this link: ${url}`);
  };

  return (
    <div className="tp-viewport">
    <div className="tp-shell" style={{ '--tp-accent': accent } as React.CSSProperties}>
      {preview ? (
        <div className="tp-preview-banner" role="status">
          <Eye size={14} /> Preview mode — this page is not public yet.
        </div>
      ) : null}

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <header className="tp-hero">
        <div className="tp-hero-cover" aria-hidden="true">
          {coverImageUrl ? <img src={coverImageUrl} alt="" loading="eager" /> : null}
        </div>
        <div className="tp-hero-body">
          <div className="tp-hero-photo">
            {page.hero_image_url
              ? <img src={page.hero_image_url} alt={page.display_name} loading="eager" />
              : <span className="tp-hero-initials" aria-hidden="true">{initials(page.display_name)}</span>}
          </div>
          <div className="tp-hero-info">
          <h1 className="tp-hero-name">{page.display_name}</h1>
          {page.coaching_name ? <p className="tp-hero-coaching"><BadgeCheck size={15} /> {page.coaching_name}</p> : null}
          {page.tagline ? <p className="tp-hero-tagline">{page.tagline}</p> : null}
          {page.subjects.length > 0 ? (
            <div className="tp-chip-row">
              {page.subjects.map(subject => (
                <span key={subject} className="tp-chip">{subject}</span>
              ))}
            </div>
          ) : null}
            <div className="tp-hero-actions">
              {page.contact_whatsapp ? (
                <a href={whatsappHref ?? '#'} target="_blank" rel="noreferrer" className="tp-btn tp-btn-primary">
                  <MessageCircle size={15} /> WhatsApp
                </a>
              ) : null}
              {page.contact_phone ? (
                <a href={`tel:${page.contact_phone.replace(/\s/g, '')}`} className="tp-btn tp-btn-ghost">
                  <Phone size={15} /> Call
                </a>
              ) : null}
              <button type="button" onClick={sharePage} className="tp-btn tp-btn-ghost">
                <Share2 size={15} /> Share
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── About ────────────────────────────────────────────────── */}
      {page.bio ? (
        <section className="tp-section" aria-label="About">
          <h2>About</h2>
          <p className="tp-bio">{page.bio}</p>
        </section>
      ) : null}

      {/* ── Achievements gallery ─────────────────────────────────────── */}
      {achievements.length > 0 ? (
        <section className="tp-section" aria-label="Achievements">
          <h2><Award size={17} /> Achievements</h2>
          <div className="tp-gallery">
            {achievements.map((m, index) => (
              <button key={m.id} type="button" className="tp-gallery-item" onClick={() => setLightbox({ kind: 'achievement', index })}>
                <img src={publicUrlForPath(m.storage_path)} alt={m.alt_text || m.caption || 'Achievement'} loading="lazy" />
                {m.caption ? <span className="tp-gallery-caption">{m.caption}</span> : null}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Classroom gallery ────────────────────────────────────────── */}
      {classroom.length > 0 ? (
        <section className="tp-section" aria-label="Classroom">
          <h2><Camera size={17} /> Our classroom</h2>
          <div className="tp-gallery">
            {classroom.map((m, index) => (
              <button key={m.id} type="button" className="tp-gallery-item" onClick={() => setLightbox({ kind: 'classroom', index })}>
                <img src={publicUrlForPath(m.storage_path)} alt={m.alt_text || m.caption || 'Classroom'} loading="lazy" />
                {m.caption ? <span className="tp-gallery-caption">{m.caption}</span> : null}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Join a batch (enrollment funnel) ─────────────────────────── */}
      {batches.length > 0 ? (
        <section className="tp-section" id="batches" aria-label="Batches">
          <h2><Users size={17} /> Join a batch</h2>
          <div className="tp-batch-list">
            {batches.map(batch => (
              <div key={batch.id} className="tp-batch-card">
                <div className="tp-batch-card-info">
                  <div className="tp-batch-name">{batch.name}</div>
                  {batch.description ? <div className="tp-batch-desc">{batch.description}</div> : null}
                  <div className="tp-batch-code">
                    Join code: <code>{batch.code}</code>
                    <button
                      type="button"
                      className="tp-batch-copy"
                      aria-label={`Copy join code ${batch.code}`}
                      title="Copy join code"
                      onClick={() => void copyBatchCode(batch.code)}
                    >
                      <Copy size={13} />
                    </button>
                  </div>
                </div>
                <Link to={`/student/register?batch=${encodeURIComponent(batch.code)}`} className="tp-btn tp-btn-primary tp-batch-join">
                  Join <ExternalLink size={13} />
                </Link>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Contact ──────────────────────────────────────────────────── */}
      {(page.contact_phone || page.contact_email || page.contact_whatsapp || Object.keys(page.social_links).length > 0) ? (
        <section className="tp-section" id="contact" aria-label="Contact">
          <h2>Contact</h2>
          <div className="tp-contact-list">
            {page.contact_phone ? (
              <a href={`tel:${page.contact_phone.replace(/\s/g, '')}`} className="tp-contact-item">
                <Phone size={16} /> {page.contact_phone}
              </a>
            ) : null}
            {page.contact_whatsapp ? (
              <a href={whatsappHref ?? '#'} target="_blank" rel="noreferrer" className="tp-contact-item">
                <MessageCircle size={16} /> WhatsApp
              </a>
            ) : null}
            {page.contact_email ? (
              <a href={`mailto:${page.contact_email}`} className="tp-contact-item">
                <Mail size={16} /> {page.contact_email}
              </a>
            ) : null}
            {Object.entries(page.social_links).map(([key, url]) => {
              const Icon = SOCIAL_ICONS[key] ?? Globe;
              return (
                <a key={key} href={url} target="_blank" rel="noreferrer" className="tp-contact-item">
                  <Icon size={16} /> {key.charAt(0).toUpperCase() + key.slice(1)}
                </a>
              );
            })}
          </div>
        </section>
      ) : null}

      <footer className="tp-footer">
        Built with <Link to="/">MockMate</Link>
      </footer>

      {/* ── Sticky mobile CTA bar (only when there is something to do) ── */}
      {batches.length > 0 || page.contact_whatsapp || page.contact_phone ? (
        <div className="tp-cta-bar">
          {batches.length > 0 ? (
            <a href="#batches" className="tp-btn tp-btn-primary tp-cta-main">Join a batch</a>
          ) : null}
          {page.contact_whatsapp ? (
            <a href={whatsappHref ?? '#'} target="_blank" rel="noreferrer" className="tp-btn tp-btn-ghost tp-cta-whatsapp">
              <MessageCircle size={15} /> WhatsApp
            </a>
          ) : null}
          {page.contact_phone ? (
            <a href={`tel:${page.contact_phone.replace(/\s/g, '')}`} className="tp-btn tp-btn-ghost tp-cta-call">
              <Phone size={15} /> Call
            </a>
          ) : null}
        </div>
      ) : null}

      {/* ── Lightbox (arrow-key + button navigation) ─────────────────── */}
      {lightbox && lightboxItem ? (
        <div className="tp-lightbox" role="dialog" aria-modal="true" onClick={() => setLightbox(null)}>
          {lightboxList.length > 1 ? (
            <>
              <button
                type="button"
                className="tp-lightbox-nav tp-lightbox-prev"
                aria-label="Previous image"
                onClick={e => { e.stopPropagation(); stepLightbox(-1); }}
              >
                <ChevronLeft size={22} />
              </button>
              <span className="tp-lightbox-count" aria-live="polite">
                {lightbox.index + 1} / {lightboxList.length}
              </span>
              <button
                type="button"
                className="tp-lightbox-nav tp-lightbox-next"
                aria-label="Next image"
                onClick={e => { e.stopPropagation(); stepLightbox(1); }}
              >
                <ChevronRight size={22} />
              </button>
            </>
          ) : null}
          <figure onClick={e => e.stopPropagation()}>
            <img src={publicUrlForPath(lightboxItem.storage_path)} alt={lightboxItem.alt_text || lightboxItem.caption || ''} />
            {lightboxItem.caption ? <figcaption>{lightboxItem.caption}</figcaption> : null}
            <button type="button" className="tp-lightbox-close" aria-label="Close" onClick={() => setLightbox(null)}>
              <X size={20} />
            </button>
          </figure>
        </div>
      ) : null}
    </div>
    </div>
  );
};

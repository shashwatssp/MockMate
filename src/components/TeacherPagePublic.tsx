import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';
import { getPublicTeacherPage } from '../lib/teacherPage';
import type { PublicTeacherPageData } from '../lib/teacherPage';
import { TeacherPageView } from './TeacherPageView';
import { Skeleton, SkeletonList } from './Skeleton';
import './TeacherPagePublic.css';

/** Upsert an OG/twitter meta tag in <head>; returns a restore callback. */
const setMeta = (attr: 'property' | 'name', key: string, content: string): (() => void) => {
  const selector = `meta[${attr}="${key}"]`;
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  const created = !el;
  const previous = el?.getAttribute('content') ?? null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
  return () => {
    if (created) el?.remove();
    else if (previous !== null) el?.setAttribute('content', previous);
  };
};

/**
 * Public Teacher Page — the shareable mini-website at /t/<slug>.
 * Data wrapper only: fetches the published page (or draft with the exact
 * unlisted preview token), sets social meta, and renders the shared
 * presentational view. Draft pages show a "Preview mode" banner.
 */
export const TeacherPagePublic: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const previewToken = searchParams.get('preview');
  const [data, setData] = useState<PublicTeacherPageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setLoading(true);
    getPublicTeacherPage(slug, previewToken)
      .then(result => { if (!cancelled) setData(result); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug, previewToken]);

  const page = data?.page ?? null;
  const accent = page?.theme?.accent ?? '#6366f1';

  // Social meta (best-effort in an SPA; a prerender edge function is the
  // documented Phase 5.3 enhancement for crawlers that ignore JS).
  useEffect(() => {
    if (!page) return;
    const title = page.coaching_name
      ? `${page.display_name} · ${page.coaching_name}`
      : page.display_name;
    const description = page.tagline
      || (page.bio ? page.bio.slice(0, 160) : `Meet ${page.display_name} on MockMate.`);
    const image = page.hero_image_url || `${window.location.origin}/vite.svg`;
    const restores = [
      setMeta('property', 'og:title', title),
      setMeta('property', 'og:description', description),
      setMeta('property', 'og:image', image),
      setMeta('property', 'og:url', window.location.href),
      setMeta('property', 'og:type', 'profile'),
      setMeta('name', 'twitter:card', 'summary_large_image'),
      setMeta('name', 'theme-color', accent),
    ];
    const previousTitle = document.title;
    document.title = title;
    return () => {
      restores.forEach(restore => restore());
      document.title = previousTitle;
    };
  }, [page, accent]);

  if (loading) {
    return (
      <div className="tp-shell" role="status" aria-busy="true">
        <span className="skel-sr">Loading page…</span>
        <div className="skeleton-card skel-results-hero">
          <Skeleton className="skel-ring" />
          <div className="skel-results-lines">
            <Skeleton className="skeleton-line" style={{ width: '55%', height: 24 }} />
            <Skeleton className="skeleton-line skeleton-line-thin" style={{ width: '72%' }} />
          </div>
        </div>
        <SkeletonList rows={3} />
      </div>
    );
  }

  if (!data || !page) {
    return (
      <div className="tp-shell tp-missing">
        <GraduationCap size={44} className="tp-missing-icon" />
        <h1>This page isn&apos;t available</h1>
        <p>The link may be wrong, or the teacher hasn&apos;t published their page yet.</p>
        <Link to="/" className="tp-btn tp-btn-primary">Go to MockMate</Link>
      </div>
    );
  }

  return (
    <TeacherPageView
      page={page}
      media={data.media}
      batches={data.batches}
      preview={data.preview}
    />
  );
};

export default TeacherPagePublic;

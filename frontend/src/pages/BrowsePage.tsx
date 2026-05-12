import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { getBrowseProfiles, searchProfiles } from '../lib/api';
import SkillTag from '../components/SkillTag';
import { useTheme } from '../lib/theme';
import type { BrowseProfile } from '../types';

type SearchResult = BrowseProfile & { score?: number };

function SkeletonPulse({ style }: { style: React.CSSProperties }) {
  return (
    <motion.div
      animate={{ opacity: [0.35, 0.65, 0.35] }}
      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
      style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '0.5rem', ...style }}
    />
  );
}

function ProfileCardSkeleton() {
  return (
    <div className="glass" style={{ borderRadius: '1.25rem', padding: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', marginBottom: '1rem' }}>
        <SkeletonPulse style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <SkeletonPulse style={{ width: '60%', height: 12, marginBottom: '0.4rem' }} />
          <SkeletonPulse style={{ width: '40%', height: 10 }} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.875rem' }}>
        {[72, 90, 60, 80].map((w, i) => (
          <SkeletonPulse key={i} style={{ width: w, height: 26, borderRadius: '9999px' }} />
        ))}
      </div>
      <SkeletonPulse style={{ width: '100%', height: 11, marginBottom: '0.4rem' }} />
      <SkeletonPulse style={{ width: '80%', height: 11, marginBottom: '1.25rem' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <SkeletonPulse style={{ width: 70, height: 20 }} />
        <SkeletonPulse style={{ width: 110, height: 34, borderRadius: '0.625rem' }} />
      </div>
    </div>
  );
}

function ProfileCard({ profile, isDark, score }: { profile: BrowseProfile; isDark: boolean; score?: number }) {
  const navigate = useNavigate();
  const primaryColor = isDark ? '#14f070' : '#0d4aa5';
  const initials = profile.wallet.slice(0, 2).toUpperCase();
  const truncated = `${profile.wallet.slice(0, 4)}...${profile.wallet.slice(-4)}`;
  const visibleSkills = profile.skillReport.skills.slice(0, 5);
  const extraCount = profile.skillReport.skills.length - visibleSkills.length;

  return (
    <motion.div
      className="glass"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3, boxShadow: isDark ? '0 8px 32px rgba(20,241,112,0.08)' : '0 8px 32px rgba(13,74,165,0.1)' }}
      transition={{ duration: 0.25 }}
      style={{ borderRadius: '1.25rem', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.875rem', position: 'relative' }}
    >
      {/* Similarity score badge — only shown in search results */}
      {score !== undefined && (
        <div style={{
          position: 'absolute', top: '1rem', right: '1rem',
          fontSize: '0.6875rem', fontWeight: 700,
          color: primaryColor,
          border: `1px solid ${primaryColor}44`,
          borderRadius: '9999px',
          padding: '0.15rem 0.55rem',
          background: isDark ? 'rgba(20,241,112,0.07)' : 'rgba(13,74,165,0.07)',
          letterSpacing: '0.03em',
        }}>
          {Math.round(score * 100)}% match
        </div>
      )}

      {/* Avatar + wallet */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, #14f070, #9945FF)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: '0.875rem', color: '#0D0E12',
        }}>
          {initials}
        </div>
        <div>
          <p style={{ fontFamily: 'monospace', fontSize: '0.8125rem', color: 'var(--text-muted)', margin: 0 }}>
            {truncated}
          </p>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
            fontSize: '0.6875rem', fontWeight: 600, color: primaryColor,
            border: `1px solid ${primaryColor}33`, borderRadius: '9999px',
            padding: '0.1rem 0.5rem', marginTop: '0.2rem',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '11px', fontVariationSettings: '"FILL" 1' }}>verified</span>
            On-Chain
          </div>
        </div>
      </div>

      {/* Skills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
        {visibleSkills.map(s => <SkillTag key={s} skill={s} />)}
        {extraCount > 0 && (
          <span style={{
            fontSize: '0.75rem', color: 'var(--text-muted)', padding: '0.2rem 0.5rem',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: '9999px',
          }}>
            +{extraCount} more
          </span>
        )}
      </div>

      {/* Summary */}
      <p style={{
        fontSize: '0.8125rem', lineHeight: 1.55, color: 'var(--text-muted)', margin: 0,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {profile.skillReport.summary}
      </p>

      {/* Price + CTA */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
        <div>
          <p style={{ fontSize: '0.6875rem', color: 'var(--text-subtle)', margin: '0 0 0.1rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            Unlock Price
          </p>
          <p style={{ fontSize: '1rem', fontWeight: 700, color: primaryColor, margin: 0 }}>
            {profile.price !== null ? `${(profile.price / 1_000_000).toFixed(2)} USDC` : '—'}
          </p>
        </div>
        <motion.button
          onClick={() => navigate(`/profile/${profile.wallet}`)}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
          style={{
            padding: '0.5rem 1.125rem',
            borderRadius: '0.625rem',
            border: `1px solid ${primaryColor}`,
            background: 'transparent',
            color: primaryColor,
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '0.375rem',
          }}
        >
          View Profile
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_forward</span>
        </motion.button>
      </div>
    </motion.div>
  );
}

export default function BrowsePage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [profiles, setProfiles] = useState<BrowseProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Search state
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const primaryColor = isDark ? '#14f070' : '#0d4aa5';

  useEffect(() => {
    getBrowseProfiles()
      .then(setProfiles)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    setSearchError(false);
    try {
      const results = await searchProfiles(query.trim());
      setSearchResults(results);
    } catch {
      setSearchError(true);
    } finally {
      setSearching(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    setSearchResults(null);
    setSearchError(false);
    inputRef.current?.focus();
  };

  const isSearchMode = searchResults !== null;
  const displayProfiles: SearchResult[] = isSearchMode ? searchResults : profiles;

  return (
    <main className="page-x-pad" style={{ minHeight: '100vh', paddingTop: '88px', paddingBottom: '4rem' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>

        {/* Page header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          style={{ marginBottom: '2rem', textAlign: 'center' }}
        >
          <h1 style={{
            fontFamily: isDark ? '"Space Grotesk", sans-serif' : '"Inter", sans-serif',
            fontSize: 'clamp(1.75rem, 4vw, 2.5rem)',
            fontWeight: 700,
            marginBottom: '0.5rem',
            letterSpacing: isDark ? '-0.03em' : '-0.02em',
          }}>
            Browse <span className="gradient-text">Creds</span>
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1rem', margin: 0 }}>
            Verified on-chain credentials. Pay privately via MagicBlock PER to unlock the full report.
          </p>
        </motion.div>

        {/* ── Semantic search bar ─────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          style={{ marginBottom: '2rem' }}
        >
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.625rem', alignItems: 'center' }}>
            {/* Input */}
            <div style={{ position: 'relative', flex: 1 }}>
              <span
                className="material-symbols-outlined"
                style={{
                  position: 'absolute', left: '0.875rem', top: '50%',
                  transform: 'translateY(-50%)', fontSize: '18px',
                  color: 'var(--text-muted)', pointerEvents: 'none',
                }}
              >
                search
              </span>
              <input
                ref={inputRef}
                className="glass-input"
                style={{ paddingLeft: '2.75rem', paddingRight: query ? '2.5rem' : '1rem' }}
                placeholder='Try "backend engineer with Rust" or "AI researcher"…'
                value={query}
                onChange={e => {
                  setQuery(e.target.value);
                  if (!e.target.value) setSearchResults(null);
                }}
              />
              {/* Clear button */}
              <AnimatePresence>
                {query && (
                  <motion.button
                    type="button"
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={{ duration: 0.15 }}
                    onClick={handleClear}
                    style={{
                      position: 'absolute', right: '0.625rem', top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text-muted)', display: 'flex', padding: '0.2rem',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>close</span>
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            {/* Search button */}
            <motion.button
              type="submit"
              className="neon-btn"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 400, damping: 18 }}
              style={{ flexShrink: 0, gap: '0.4rem', padding: '0.75rem 1.25rem' }}
              disabled={searching}
            >
              {searching ? (
                <motion.span
                  className="material-symbols-outlined"
                  style={{ fontSize: '18px' }}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                >
                  progress_activity
                </motion.span>
              ) : (
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>travel_explore</span>
              )}
              {searching ? 'Searching…' : 'Search'}
            </motion.button>
          </form>

          {/* Search context hint */}
          <AnimatePresence>
            {isSearchMode && !searching && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.625rem' }}
              >
                <span style={{ color: primaryColor, fontWeight: 600 }}>{searchResults!.length}</span>
                {' '}result{searchResults!.length !== 1 ? 's' : ''} for{' '}
                <em>"{query}"</em> — ranked by semantic similarity via{' '}
                <span style={{ color: primaryColor, fontWeight: 600 }}>QVAC local embeddings</span>.{' '}
                <button
                  onClick={handleClear}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', textDecoration: 'underline', padding: 0, fontSize: 'inherit' }}
                >
                  Clear
                </button>
              </motion.p>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Loading */}
        {(loading || searching) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem' }}>
            {Array.from({ length: 6 }, (_, i) => <ProfileCardSkeleton key={i} />)}
          </div>
        )}

        {/* Error */}
        {!loading && !searching && (error || searchError) && (
          <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-muted)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem', color: primaryColor }}>error</span>
            <p>{searchError ? 'Search failed. Please try again.' : 'Failed to load profiles. Please try again later.'}</p>
          </div>
        )}

        {/* Empty */}
        {!loading && !searching && !error && !searchError && displayProfiles.length === 0 && (
          <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-muted)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem', color: primaryColor }}>
              {isSearchMode ? 'manage_search' : 'person_search'}
            </span>
            <p>{isSearchMode ? `No matches found for "${query}". Try broader terms.` : 'No credentials registered yet. Be the first!'}</p>
          </div>
        )}

        {/* Grid */}
        {!loading && !searching && !error && !searchError && displayProfiles.length > 0 && (
          <motion.div
            key={isSearchMode ? 'search' : 'browse'}
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.07 } } }}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem' }}
          >
            {displayProfiles.map(p => (
              <ProfileCard key={p.wallet} profile={p} isDark={isDark} score={(p as SearchResult).score} />
            ))}
          </motion.div>
        )}
      </div>
    </main>
  );
}



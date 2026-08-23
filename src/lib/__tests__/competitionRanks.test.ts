/**
 * Pure-logic tests for assignCompetitionRanks — the single source of truth for
 * batch ranks + percentiles used by both the Supabase leaderboard
 * (database.batchLeaderboard) and the local-device fallback
 * (localAuth.localBatchLeaderboard).
 *
 * Regression context: a tie-handling bug read `rank` off the un-mapped source
 * array (always 0), so tied students computed percentile = round(((N-0+1)/N)*100)
 * = 150% in a 2-student batch ("150th percentile" on the student dashboard).
 *
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest';
import { assignCompetitionRanks } from '../localAuth';

vi.mock('../supabase');

describe('assignCompetitionRanks', () => {
  it('gives distinct scores distinct ranks and correct percentiles', () => {
    const ranked = assignCompetitionRanks([
      { percentage: 100 },
      { percentage: 50 },
    ]);
    expect(ranked.map(r => r.rank)).toEqual([1, 2]);
    expect(ranked.map(r => r.percentile)).toEqual([100, 50]);
  });

  it('shares rank among ties (1,1,3) with equal percentile', () => {
    const ranked = assignCompetitionRanks([
      { percentage: 100 },
      { percentage: 75 },
      { percentage: 75 },
      { percentage: 25 },
    ]);
    expect(ranked.map(r => r.rank)).toEqual([1, 2, 2, 4]);
    // N=4: rank1 -> ((4-1+1)/4)*100=100, rank2 -> 75, rank4 -> 25
    expect(ranked.map(r => r.percentile)).toEqual([100, 75, 75, 25]);
  });

  it('never exceeds 100 for a fully-tied batch (regression: 150th percentile)', () => {
    const ranked = assignCompetitionRanks([
      { percentage: 50 },
      { percentage: 50 },
    ]);
    expect(ranked.map(r => r.rank)).toEqual([1, 1]);
    expect(ranked.map(r => r.percentile)).toEqual([100, 100]);
  });

  it('handles a three-way full tie in a 3-student batch', () => {
    const ranked = assignCompetitionRanks([
      { percentage: 33.3 },
      { percentage: 33.3 },
      { percentage: 33.3 },
    ]);
    expect(ranked.map(r => r.rank)).toEqual([1, 1, 1]);
    expect(ranked.map(r => r.percentile)).toEqual([100, 100, 100]);
  });

  it('returns empty output for an empty leaderboard', () => {
    expect(assignCompetitionRanks([])).toEqual([]);
  });

  it('does not mutate or depend on pre-existing rank fields of inputs', () => {
    const input = [
      { percentage: 80, rank: 999 } as { percentage: number; rank?: number },
      { percentage: 80, rank: 0 },
    ];
    const ranked = assignCompetitionRanks(input);
    expect(ranked.map(r => r.rank)).toEqual([1, 1]);
    expect(input[0].rank).toBe(999); // untouched source
  });
});

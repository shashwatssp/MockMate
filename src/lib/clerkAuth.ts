/**
 * Clerk auth bridge.
 *
 * Maps a Clerk `UserResource` → the existing `TeacherIdentity` /
 * `StudentIdentity` local shapes and writes them to the same localStorage
 * session keys (`mockmate.teacher.session`, `mockmate.student.session`).
 *
 * IMPORTANT: from the frontend (SPA) only `unsafeMetadata` is writable —
 * `publicMetadata` and `privateMetadata` require the Clerk Backend API.
 * We therefore read `unsafeMetadata.role` first (settable at signup), then
 * fall back to `publicMetadata.role` (settable only via Backend API /
 * Clerk Dashboard). This deviates from the literal plan's "publicMetadata.role";
 * see the plan notes for details.
 */

import type { UserResource } from '@clerk/shared/types';
import {
  type AccountRole,
  type LocalAccount,
  type TeacherIdentity,
  type StudentIdentity,
  upsertAccount,
  toStudentIdentity,
  setTeacherSession,
  clearTeacherSession,
  setStudentSession,
  clearStudentSession,
} from './localAuth';

/**
 * Determine the user's role from Clerk metadata.
 *
 * Reads `unsafeMetadata.role` first (the only metadata field writable from
 * the frontend), then falls back to `publicMetadata.role`.
 */
export const getClerkRole = (user: UserResource): AccountRole | null => {
  const role = user.unsafeMetadata?.role ?? user.publicMetadata?.role;
  if (role === 'teacher' || role === 'student') return role;
  return null;
};

/** Human-readable display name with fallbacks. */
export const clerkDisplayName = (user: UserResource): string => {
  if (user.fullName) return user.fullName;
  const parts = [user.firstName, user.lastName].filter(Boolean).join(' ');
  if (parts) return parts;
  return clerkEmail(user) ?? user.id;
};

/** Primary email address as a string, or undefined if none. */
export const clerkEmail = (user: UserResource): string | undefined =>
  user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress;

/**
 * Convert a Clerk teacher user into the local `TeacherIdentity` shape.
 *
 * No `LocalAccount` row is created for teachers — nothing in the local
 * store reads teacher accounts (test ownership is keyed by `teacher.id`
 * in `mockmate.local.test_owners`, set via `getTeacherSession()`).
 */
export const teacherIdentityFromClerk = (user: UserResource): TeacherIdentity => ({
  id: user.id,
  username: clerkEmail(user) ?? user.id,
  name: clerkDisplayName(user),
  isDemo: false,
});

/**
 * Materialize a local `LocalAccount` for a Clerk student user.
 *
 * `passwordHash` is always empty — Clerk students authenticate with Clerk
 * and never against the local hash store.
 */
export const studentLocalAccountFromClerk = (user: UserResource): LocalAccount => ({
  id: user.id,
  role: 'student',
  username: clerkEmail(user) ?? user.id,
  passwordHash: '',
  name: clerkDisplayName(user),
  createdAt: user.createdAt?.toISOString() ?? new Date().toISOString(),
});

/**
 * Upsert the student's local account and derive a `StudentIdentity` from it
 * (computing `isApproved` / `batchId` / `pendingBatchCode` from the local
 * enrollment store).
 */
export const ensureStudentAccount = (user: UserResource): StudentIdentity => {
  const account = studentLocalAccountFromClerk(user);
  upsertAccount(account);
  return toStudentIdentity(account);
};

/**
 * Synchronize a Clerk authentication event into the local session stores.
 *
 * - `user` with role `teacher` → write teacher session, clear student session.
 * - `user` with role `student` → upsert local student account + identity,
 *   write student session, clear teacher session.
 * - `null` → clear both sessions (explicit Clerk sign-out).
 * - unknown / unset role → no-op (does not clobber existing local sessions;
 *   the AuthBridge will re-run once a role is present).
 */
export const syncClerkSessions = (user: UserResource | null | undefined): void => {
  if (!user) {
    clearTeacherSession();
    clearStudentSession();
    return;
  }

  const role = getClerkRole(user);
  if (role === 'teacher') {
    setTeacherSession(teacherIdentityFromClerk(user));
    clearStudentSession();
  } else if (role === 'student') {
    setStudentSession(ensureStudentAccount(user));
    clearTeacherSession();
  }
  // unknown role → no-op
};

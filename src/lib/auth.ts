/**
 * Supabase RPC-backed authentication.
 *
 * All accounts and sessions live server-side (`app_users` / `app_sessions`) and
 * are reached through the security-definer RPCs:
 *   - app_signin({ p_username, p_password, p_role? })
 *   - app_signup({ p_role, p_username, p_password, p_name, p_batch_code? })
 *   - app_session({ p_token })  -> validates + resolves the session user
 *   - app_signout({ p_token })  -> invalidates the session server-side
 *
 * The previous localStorage account store is no longer on the auth path:
 * passwords are verified by `app_signin` and accounts persist in `app_users`.
 * A session token is cached locally (as any stateful auth session does) but no
 * credentials are ever stored in localStorage.
 */
import { callRpc } from './supabase';
import type { TeacherIdentity, StudentIdentity, AccountRole } from './localAuth';
import {
  setTeacherSession,
  clearTeacherSession,
  setStudentSession,
  clearStudentSession,
  getTeacherToken,
  getStudentToken,
} from './localAuth';

interface RpcUser {
  id: string;
  username: string;
  name: string;
  role: string;
  email?: string;
  isDemo?: boolean;
  batchId?: string | null;
  isApproved?: boolean;
  pendingBatchCode?: string | null;
}

interface RpcAuthResult {
  user: RpcUser;
  token: string;
}

const toTeacherIdentity = (user: RpcUser): TeacherIdentity => ({
  id: user.id,
  username: user.username,
  name: user.name,
  isDemo: Boolean(user.isDemo),
});

const toStudentIdentity = (user: RpcUser): StudentIdentity => ({
  id: user.id,
  username: user.username,
  email: user.email ?? user.username ?? '',
  name: user.name ?? null,
  batchId: user.batchId ?? null,
  isApproved: Boolean(user.isApproved),
  pendingBatchCode: user.pendingBatchCode ?? null,
});

export const signInWithEmail = async (email: string, password: string) => {
  return teacherSignIn(email, password);
};

export const signUpWithEmail = async (email: string, password: string, name?: string) => {
  const identity = await teacherSignUp(email, password, name || email.trim());
  return { session: identity, user: identity };
};

export const teacherSignUp = async (username: string, password: string, name: string): Promise<TeacherIdentity> => {
  const result = await callRpc<RpcAuthResult>('app_signup', {
    p_role: 'teacher',
    p_username: username,
    p_password: password,
    p_name: name.trim(),
  });
  if (!result || !result.user) {
    throw new Error('Unable to create teacher account.');
  }
  // Don't auto-login: the teacher signs in separately (matches the signup page).
  return toTeacherIdentity(result.user);
};

export const teacherSignIn = async (username: string, password: string): Promise<TeacherIdentity> => {
  const result = await callRpc<RpcAuthResult>('app_signin', {
    p_username: username,
    p_password: password,
    p_role: 'teacher',
  });
  if (!result || !result.user || !result.token) {
    throw new Error('Invalid username or password.');
  }
  clearStudentSession();
  const identity = toTeacherIdentity(result.user);
  setTeacherSession(identity, result.token);
  return identity;
};

export const studentSignUp = async (
  email: string,
  password: string,
  name?: string,
  batchCode?: string,
): Promise<StudentIdentity> => {
  const args: { p_role: AccountRole; p_username: string; p_password: string; p_name: string; p_batch_code?: string } = {
    p_role: 'student',
    p_username: email.trim().toLowerCase(),
    p_password: password,
    p_name: (name && name.trim()) || email.trim().toLowerCase(),
  };
  if (batchCode) {
    args.p_batch_code = batchCode.trim().toUpperCase();
  }
  const result = await callRpc<RpcAuthResult>('app_signup', args);
  if (!result || !result.user) {
    throw new Error('Unable to create student account.');
  }
  // Don't auto-login: the student signs in separately (mirrors original flow).
  return toStudentIdentity(result.user);
};

export const studentSignIn = async (email: string, password: string): Promise<StudentIdentity> => {
  const result = await callRpc<RpcAuthResult>('app_signin', {
    p_username: email.trim().toLowerCase(),
    p_password: password,
    p_role: 'student',
  });
  if (!result || !result.user || !result.token) {
    throw new Error('Invalid email or password.');
  }
  clearTeacherSession();
  const identity = toStudentIdentity(result.user);
  setStudentSession(identity, result.token);
  return identity;
};

export const signOut = async () => {
  const token = getTeacherToken() ?? getStudentToken();
  if (token) {
    try {
      await callRpc('app_signout', { p_token: token });
    } catch {
      // Token may already be invalid/expired — local clear is what matters.
    }
  }
  clearTeacherSession();
  clearStudentSession();
};

// Session helpers are re-exported here so callers read auth state from this
// module instead of reaching into the local auth cache directly.
export {
  getTeacherSession,
  getTeacherToken,
  getStudentSession,
  getStudentToken,
  setStudentSession,
  clearStudentSession,
  clearTeacherSession,
} from './localAuth';
export type { TeacherIdentity, StudentIdentity, AccountRole } from './localAuth';

export const handleAuthCallback = async (): Promise<boolean> => false;

export const resetPassword = async (_email: string) => {
  throw new Error('Password reset is not available for Supabase username accounts. Sign in with your username or use the demo teacher ID 1234.');
};

export const updatePassword = async (_password: string) => {
  throw new Error('Password changes are not available yet. Use your existing username and password.');
};

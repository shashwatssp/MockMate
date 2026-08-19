/**
 * Local username-based identity, sessions, batches and enrollments.
 *
 * Auth no longer depends on Supabase email confirmation. Teachers and students
 * sign up / sign in with a username. The existing demo teacher (1234 / Testing)
 * is seeded as a first-class account so batch management works for that login.
 */

export type AccountRole = 'teacher' | 'student';

export interface LocalAccount {
  id: string;
  role: AccountRole;
  username: string;
  passwordHash: string;
  name: string;
  createdAt: string;
}

export interface TeacherIdentity {
  id: string;
  username: string;
  name: string;
  isDemo: boolean;
}

export interface StudentIdentity {
  id: string;
  username: string;
  email: string;
  name: string | null;
  batchId: string | null;
  isApproved: boolean;
  /** Batch code of a pending enrollment (not yet approved by the teacher). */
  pendingBatchCode?: string | null;
}

export interface BatchRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  teacher_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StudentRow {
  id: string;
  username: string;
  email: string;
  name: string | null;
  batch_id: string | null;
  is_approved: boolean;
  created_at: string;
  updated_at: string;
}

export interface EnrollmentRow {
  id: string;
  username: string;
  name: string | null;
  email: string;
  batch_id: string;
  student_id: string | null;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  notes: string | null;
}

export interface LocalTestResult {
  id: string;
  testId: string;
  studentId: string;
  studentUsername: string;
  studentName: string;
  studentEmail: string;
  batchId: string | null;
  answers: unknown[];
  score: number;
  totalQuestions: number;
  timeTaken?: number;
  completedAt: string;
}

export interface BatchLeaderboardEntry {
  rank: number;
  studentId: string;
  email: string;
  username: string;
  name: string | null;
  score: number;
  totalMarks: number;
  percentage: number;
  completedAt: string;
}

const KEYS = {
  accounts: 'mockmate.local.accounts',
  teacherSession: 'mockmate.teacher.session',
  studentSession: 'mockmate.student.session',
  batches: 'mockmate.local.batches',
  enrollments: 'mockmate.local.enrollments',
  testBatches: 'mockmate.local.test_batches',
  results: 'mockmate.local.results',
  seeded: 'mockmate.local.seeded.v2',
} as const;

export const DEMO_TEACHER = {
  id: 'teacher-demo-1234',
  username: '1234',
  password: 'Testing',
  name: 'Demo Teacher',
} as const;

const BATCH_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const BATCH_CODE_LENGTH = 6;
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,32}$/;
const STUDENT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type MemoryStore = Record<string, string>;
const memoryStore: MemoryStore = {};

const getStorage = (): { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void } => {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return {
    getItem: (key) => (key in memoryStore ? memoryStore[key] : null),
    setItem: (key, value) => { memoryStore[key] = value; },
    removeItem: (key) => { delete memoryStore[key]; },
  };
};

const readJson = <T>(key: string, fallback: T): T => {
  try {
    const raw = getStorage().getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: unknown) => {
  try {
    getStorage().setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota / private-mode failures */
  }
};

const nowIso = () => new Date().toISOString();

const createId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

export const normalizeUsername = (value: string) => value.trim().toLowerCase();

export const validateUsername = (value: string) => {
  const username = value.trim();
  if (!username) throw new Error('Username is required.');
  if (username.includes('@')) throw new Error('Use a username, not an email address.');
  if (!USERNAME_PATTERN.test(username) && username !== DEMO_TEACHER.username) {
    throw new Error('Username must be 3-32 characters: letters, numbers, dots, hyphens or underscores.');
  }
  return username;
};

/**
 * Validates a student identifier. Students sign in with their email
 * address, so we validate email format rather than username format.
 */
export const validateStudentIdentifier = (value: string) => {
  const identifier = value.trim().toLowerCase();
  if (!identifier) throw new Error('Email is required.');
  if (!STUDENT_EMAIL_PATTERN.test(identifier)) {
    throw new Error('Please enter a valid email address.');
  }
  return identifier;
};

export const hashPassword = async (password: string): Promise<string> => {
  const payload = `mockmate:v1:${password}`;
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv_${(hash >>> 0).toString(16)}`;
};

const passwordsMatch = async (password: string, storedHash: string) => {
  const hashed = await hashPassword(password);
  return hashed === storedHash;
};

const getAccounts = (): LocalAccount[] => readJson<LocalAccount[]>(KEYS.accounts, []);
const saveAccounts = (accounts: LocalAccount[]) => writeJson(KEYS.accounts, accounts);
/**
 * Idempotently create or update a local account keyed by `id`.
 *
 * The Clerk auth bridge uses this to materialize a local account for a
 * signed-in Clerk user (student) without going through the username/password
 * signup flow. `passwordHash` is left empty for Clerk accounts — they
 * authenticate with Clerk and never against the local hash store.
 */
export const upsertAccount = (account: LocalAccount): LocalAccount => {
  const accounts = getAccounts();
  const index = accounts.findIndex((row) => row.id === account.id);
  if (index >= 0) {
    // Preserve the original creation timestamp of an existing account; keep
    // role/username/name in sync from the authoritative (Clerk) source.
    accounts[index] = { ...account, createdAt: accounts[index].createdAt ?? account.createdAt };
  } else {
    accounts.push(account);
  }
  saveAccounts(accounts);
  return account;
};
const getBatches = (): BatchRow[] => readJson<BatchRow[]>(KEYS.batches, []);
const saveBatches = (batches: BatchRow[]) => writeJson(KEYS.batches, batches);
const getEnrollments = (): EnrollmentRow[] => readJson<EnrollmentRow[]>(KEYS.enrollments, []);
const saveEnrollments = (rows: EnrollmentRow[]) => writeJson(KEYS.enrollments, rows);
const getTestBatchLinks = (): Array<{ test_id: string; batch_id: string; created_at: string }> =>
  readJson(KEYS.testBatches, []);
const saveTestBatchLinks = (rows: Array<{ test_id: string; batch_id: string; created_at: string }>) =>
  writeJson(KEYS.testBatches, rows);
const getLocalResults = (): LocalTestResult[] => readJson<LocalTestResult[]>(KEYS.results, []);
const saveLocalResults = (rows: LocalTestResult[]) => writeJson(KEYS.results, rows);

const findAccountByUsername = (username: string) => {
  const normalized = normalizeUsername(username);
  return getAccounts().find((account) => normalizeUsername(account.username) === normalized) ?? null;
};

const toStudentRow = (account: LocalAccount, enrollment?: EnrollmentRow | null): StudentRow => ({
  id: account.id,
  username: account.username,
  email: account.username,
  name: account.name,
  batch_id: enrollment?.status === 'approved' ? enrollment.batch_id : null,
  is_approved: enrollment?.status === 'approved',
  created_at: account.createdAt,
  updated_at: enrollment?.reviewed_at || account.createdAt,
});

const approvedEnrollmentFor = (studentId: string) =>
  getEnrollments().find((row) => row.student_id === studentId && row.status === 'approved') ?? null;

const findBatchByIdSync = (id: string): BatchRow | null =>
  getBatches().find((row) => row.id === id) ?? null;

const pendingEnrollmentFor = (studentId: string): { batchCode: string } | null => {
  const enrollment = getEnrollments().find(
    (row) => row.student_id === studentId && row.status === 'pending',
  );
  if (!enrollment) return null;
  const batch = findBatchByIdSync(enrollment.batch_id);
  return batch ? { batchCode: batch.code } : null;
};

export const toStudentIdentity = (account: LocalAccount): StudentIdentity => {
  const approved = approvedEnrollmentFor(account.id);
  const pending = pendingEnrollmentFor(account.id);
  return {
    id: account.id,
    username: account.username,
    email: account.username,
    name: account.name,
    batchId: approved?.batch_id ?? null,
    isApproved: Boolean(approved),
    pendingBatchCode: pending?.batchCode ?? null,
  };
};

const toTeacherIdentity = (account: LocalAccount): TeacherIdentity => ({
  id: account.id,
  username: account.username,
  name: account.name,
  isDemo: account.id === DEMO_TEACHER.id || normalizeUsername(account.username) === DEMO_TEACHER.username,
});

export const generateBatchCode = (): string => {
  let code = '';
  for (let i = 0; i < BATCH_CODE_LENGTH; i += 1) {
    code += BATCH_CODE_ALPHABET[Math.floor(Math.random() * BATCH_CODE_ALPHABET.length)];
  }
  return code;
};

export const ensureLocalDirectory = async () => {
  const accounts = getAccounts();
  const demoHash = await hashPassword(DEMO_TEACHER.password);
  const existingDemo = accounts.find((account) => account.id === DEMO_TEACHER.id)
    || accounts.find((account) => normalizeUsername(account.username) === DEMO_TEACHER.username);

  if (!existingDemo) {
    accounts.push({
      id: DEMO_TEACHER.id,
      role: 'teacher',
      username: DEMO_TEACHER.username,
      passwordHash: demoHash,
      name: DEMO_TEACHER.name,
      createdAt: nowIso(),
    });
    saveAccounts(accounts);
  } else if (existingDemo.passwordHash !== demoHash) {
    existingDemo.passwordHash = demoHash;
    existingDemo.role = 'teacher';
    existingDemo.name = existingDemo.name || DEMO_TEACHER.name;
    saveAccounts(accounts);
  }

  if (!getStorage().getItem(KEYS.seeded)) {
    const batches = getBatches();
    if (!batches.some((batch) => batch.teacher_id === DEMO_TEACHER.id && batch.code === 'DEMO01')) {
      const created = nowIso();
      batches.unshift({
        id: 'batch-demo-01',
        code: 'DEMO01',
        name: 'Demo Batch',
        description: 'Seeded batch for the demo teacher. Share code DEMO01 with students.',
        teacher_id: DEMO_TEACHER.id,
        is_active: true,
        created_at: created,
        updated_at: created,
      });
      saveBatches(batches);
    }
    getStorage().setItem(KEYS.seeded, '1');
  }
};

interface TeacherSessionEntry { token: string | null; user: TeacherIdentity }
interface StudentSessionEntry { token: string | null; user: StudentIdentity }

// Sessions are cached client-side as { token, user }. The token is the server-
// issued `app_sessions` token (validated via app_session); the user object is the
// resolved identity. No credentials are ever stored here — accounts live only
// in `app_users` and are authenticated through the app_signin/app_signup RPCs.
export const getTeacherSession = (): TeacherIdentity | null =>
  readJson<TeacherSessionEntry | null>(KEYS.teacherSession, null)?.user ?? null;

export const getTeacherToken = (): string | null =>
  readJson<TeacherSessionEntry | null>(KEYS.teacherSession, null)?.token ?? null;

export const setTeacherSession = (identity: TeacherIdentity, token?: string) => {
  const existing = readJson<TeacherSessionEntry | null>(KEYS.teacherSession, null);
  writeJson(KEYS.teacherSession, {
    token: token !== undefined ? token : (existing?.token ?? null),
    user: identity,
  });
};

export const clearTeacherSession = () => getStorage().removeItem(KEYS.teacherSession);

export const getStudentSession = (): StudentIdentity | null =>
  readJson<StudentSessionEntry | null>(KEYS.studentSession, null)?.user ?? null;

export const getStudentToken = (): string | null =>
  readJson<StudentSessionEntry | null>(KEYS.studentSession, null)?.token ?? null;

export const setStudentSession = (identity: StudentIdentity, token?: string) => {
  const existing = readJson<StudentSessionEntry | null>(KEYS.studentSession, null);
  writeJson(KEYS.studentSession, {
    token: token !== undefined ? token : (existing?.token ?? null),
    user: identity,
  });
};

export const clearStudentSession = () => getStorage().removeItem(KEYS.studentSession);

export const signOutLocal = () => {
  clearTeacherSession();
  clearStudentSession();
};

export const registerTeacher = async (username: string, password: string, name: string): Promise<TeacherIdentity> => {
  await ensureLocalDirectory();
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('Full name is required.');
  if (password.length < 6) throw new Error('Password must be at least 6 characters.');
  const safeUsername = validateUsername(username);
  if (normalizeUsername(safeUsername) === DEMO_TEACHER.username) {
    throw new Error('That username is reserved for the demo teacher.');
  }
  if (findAccountByUsername(safeUsername)) {
    throw new Error('That username is already taken.');
  }
  const account: LocalAccount = {
    id: createId('teacher'),
    role: 'teacher',
    username: safeUsername,
    passwordHash: await hashPassword(password),
    name: trimmedName,
    createdAt: nowIso(),
  };
  saveAccounts([...getAccounts(), account]);
  // Do NOT auto-login — the teacher must sign in separately so the
  // signup → sign-in flow is verifiable and reusable.
  return toTeacherIdentity(account);
};

export const signInTeacher = async (username: string, password: string): Promise<TeacherIdentity> => {
  await ensureLocalDirectory();
  const account = findAccountByUsername(username);
  if (!account || account.role !== 'teacher') {
    throw new Error('Invalid username or password.');
  }
  if (!(await passwordsMatch(password, account.passwordHash))) {
    throw new Error('Invalid username or password.');
  }
  const identity = toTeacherIdentity(account);
  clearStudentSession();
  setTeacherSession(identity);
  return identity;
};

export const registerStudent = async (
  email: string,
  password: string,
  name: string,
  batchCode?: string,
): Promise<StudentIdentity> => {
  await ensureLocalDirectory();
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('Full name is required.');
  if (password.length < 6) throw new Error('Password must be at least 6 characters.');
  const safeEmail = validateStudentIdentifier(email);
  if (findAccountByUsername(safeEmail)) {
    throw new Error('That email is already registered.');
  }

  const account: LocalAccount = {
    id: createId('student'),
    role: 'student',
    username: safeEmail,
    passwordHash: await hashPassword(password),
    name: trimmedName,
    createdAt: nowIso(),
  };
  saveAccounts([...getAccounts(), account]);
  // Batch code is optional — a student can create an account without one
  // and be added to a batch later by a teacher via email.
  if (batchCode) {
    const batch = getBatchByCode(batchCode);
    if (!batch) throw new Error('Invalid batch code.');
    createEnrollment(account, batch);
  }
  // Do NOT auto-login after registration — the student must sign in
  // separately so the signup → sign-in flow is verifiable (mirrors ChatFlow).
  return toStudentIdentity(account);
};

export const signInStudent = async (email: string, password: string): Promise<StudentIdentity> => {
  await ensureLocalDirectory();
  const account = findAccountByUsername(email);
  if (!account || account.role !== 'student') {
    throw new Error('Invalid email or password.');
  }
  if (!(await passwordsMatch(password, account.passwordHash))) {
    throw new Error('Invalid email or password.');
  }
  const identity = toStudentIdentity(account);
  clearTeacherSession();
  setStudentSession(identity);
  return identity;
};

export const getStudentProfile = async (): Promise<StudentIdentity | null> => {
  await ensureLocalDirectory();
  const session = getStudentSession();
  if (!session) return null;
  const account = getAccounts().find((row) => row.id === session.id && row.role === 'student');
  if (!account) {
    clearStudentSession();
    return null;
  }
  const identity = toStudentIdentity(account);
  setStudentSession(identity);
  return identity;
};

export const createBatch = async ({
  name,
  teacherId,
  description,
}: {
  name: string;
  teacherId: string;
  description?: string;
}): Promise<BatchRow> => {
  await ensureLocalDirectory();
  if (!name.trim()) throw new Error('Batch name is required.');
  if (!teacherId) throw new Error('Not authenticated.');
  const existing = new Set(getBatches().map((batch) => batch.code));
  let code = generateBatchCode();
  let guard = 0;
  while (existing.has(code) && guard < 20) {
    code = generateBatchCode();
    guard += 1;
  }
  const created = nowIso();
  const batch: BatchRow = {
    id: createId('batch'),
    code,
    name: name.trim(),
    description: description?.trim() || null,
    teacher_id: teacherId,
    is_active: true,
    created_at: created,
    updated_at: created,
  };
  saveBatches([batch, ...getBatches()]);
  return batch;
};

export const getBatchesForTeacher = async (teacherId: string): Promise<BatchRow[]> => {
  await ensureLocalDirectory();
  return getBatches()
    .filter((batch) => batch.teacher_id === teacherId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
};

export const getBatchByCode = (code: string): BatchRow | null => {
  const normalized = code.trim().toUpperCase();
  return getBatches().find((batch) => batch.code.toUpperCase() === normalized) ?? null;
};

export const getBatchById = async (id: string): Promise<BatchRow> => {
  await ensureLocalDirectory();
  const batch = getBatches().find((row) => row.id === id);
  if (!batch) throw new Error('Batch not found');
  return batch;
};

const createEnrollment = (account: LocalAccount, batch: BatchRow): EnrollmentRow => {
  const enrollments = getEnrollments();
  const existingIndex = enrollments.findIndex(
    (row) => row.batch_id === batch.id && normalizeUsername(row.username) === normalizeUsername(account.username),
  );
  if (existingIndex >= 0) {
    // Link this account to a pre-existing enrollment (e.g. created by the
    // teacher adding the student by email before the student registered).
    // Without this, the student_id stays null and the student won't be
    // recognised as enrolled after approval.
    const updated = {
      ...enrollments[existingIndex],
      student_id: account.id,
    };
    enrollments[existingIndex] = updated;
    saveEnrollments(enrollments);
    return updated;
  }
  const approvedElsewhere = getEnrollments().find(
    (row) => row.student_id === account.id && row.status === 'approved' && row.batch_id !== batch.id,
  );
  if (approvedElsewhere) {
    throw new Error('This username is already enrolled in another batch.');
  }
  const enrollment: EnrollmentRow = {
    id: createId('enroll'),
    username: account.username,
    name: account.name,
    email: account.username,
    batch_id: batch.id,
    student_id: account.id,
    status: 'pending',
    requested_at: nowIso(),
    reviewed_by: null,
    reviewed_at: null,
    notes: null,
  };
  saveEnrollments([...getEnrollments(), enrollment]);
  return enrollment;
};

export const createBatchEnrollment = async ({
  email,
  batchCode,
}: {
  email: string;
  batchCode: string;
}) => {
  await ensureLocalDirectory();
  const batch = getBatchByCode(batchCode);
  if (!batch) throw new Error('Invalid batch code');
  const account = findAccountByUsername(email);
  if (account && account.role !== 'student') {
    throw new Error('That email belongs to a teacher account.');
  }
  if (account) {
    return createEnrollment(account, batch);
  }
  const existing = getEnrollments().find(
    (row) => row.batch_id === batch.id && normalizeUsername(row.username) === normalizeUsername(email),
  );
  if (existing) return existing;
  const enrollment: EnrollmentRow = {
    id: createId('enroll'),
    username: email.trim(),
    name: null,
    email: email.trim(),
    batch_id: batch.id,
    student_id: null,
    status: 'pending',
    requested_at: nowIso(),
    reviewed_by: null,
    reviewed_at: null,
    notes: null,
  };
  saveEnrollments([...getEnrollments(), enrollment]);
  return enrollment;
};

export const getPendingEnrollments = async (batchId: string): Promise<EnrollmentRow[]> => {
  await ensureLocalDirectory();
  return getEnrollments()
    .filter((row) => row.batch_id === batchId && row.status === 'pending')
    .sort((a, b) => a.requested_at.localeCompare(b.requested_at));
};

export const getStudentsInBatch = async (batchId: string): Promise<StudentRow[]> => {
  await ensureLocalDirectory();
  const approved = getEnrollments().filter((row) => row.batch_id === batchId && row.status === 'approved');
  return approved.map((enrollment) => {
    const account = enrollment.student_id
      ? getAccounts().find((row) => row.id === enrollment.student_id)
      : findAccountByUsername(enrollment.username);
    if (account) return toStudentRow(account, enrollment);
    return {
      id: enrollment.student_id || enrollment.id,
      username: enrollment.username,
      email: enrollment.username,
      name: enrollment.name,
      batch_id: batchId,
      is_approved: true,
      created_at: enrollment.requested_at,
      updated_at: enrollment.reviewed_at || enrollment.requested_at,
    };
  });
};

export const approveBatchEnrollment = async (enrollmentId: string, teacherId: string) => {
  await ensureLocalDirectory();
  const enrollments = getEnrollments();
  const enrollment = enrollments.find((row) => row.id === enrollmentId);
  if (!enrollment) throw new Error('enrollment not found');
  const batch = getBatches().find((row) => row.id === enrollment.batch_id);
  if (!batch || batch.teacher_id !== teacherId) throw new Error('not authorized to approve this enrollment');

  const next = enrollments.map((row) => {
    if (row.student_id && enrollment.student_id && row.student_id === enrollment.student_id && row.status === 'approved' && row.id !== enrollment.id) {
      return { ...row, status: 'rejected' as const, reviewed_by: teacherId, reviewed_at: nowIso() };
    }
    if (row.id === enrollment.id) {
      return {
        ...row,
        status: 'approved' as const,
        reviewed_by: teacherId,
        reviewed_at: nowIso(),
        student_id: row.student_id,
      };
    }
    return row;
  });
  saveEnrollments(next);
  const session = getStudentSession();
  if (session && (session.id === enrollment.student_id || normalizeUsername(session.username) === normalizeUsername(enrollment.username))) {
    const account = enrollment.student_id
      ? getAccounts().find((row) => row.id === enrollment.student_id)
      : findAccountByUsername(enrollment.username);
    if (account) setStudentSession(toStudentIdentity(account));
  }
  return { status: 'approved', batch_id: enrollment.batch_id, username: enrollment.username, student_id: enrollment.student_id };
};

export const rejectBatchEnrollment = async (enrollmentId: string, teacherId: string) => {
  await ensureLocalDirectory();
  const enrollments = getEnrollments();
  const enrollment = enrollments.find((row) => row.id === enrollmentId);
  if (!enrollment) throw new Error('enrollment not found');
  const batch = getBatches().find((row) => row.id === enrollment.batch_id);
  if (!batch || batch.teacher_id !== teacherId) throw new Error('not authorized');
  saveEnrollments(enrollments.map((row) => (
    row.id === enrollmentId
      ? { ...row, status: 'rejected' as const, reviewed_by: teacherId, reviewed_at: nowIso() }
      : row
  )));
  return { status: 'rejected', username: enrollment.username, batch_id: enrollment.batch_id };
};

export const moveStudent = async (studentId: string, toBatchId: string, teacherId: string) => {
  await ensureLocalDirectory();
  const destination = getBatches().find((row) => row.id === toBatchId);
  if (!destination) throw new Error('destination batch not found');
  if (destination.teacher_id !== teacherId) throw new Error('not authorized');
  const enrollments = getEnrollments();
  const current = enrollments.find((row) => row.student_id === studentId && row.status === 'approved');
  const account = getAccounts().find((row) => row.id === studentId);
  const next = enrollments
    .map((row) => (
      row.student_id === studentId && row.status === 'approved'
        ? { ...row, status: 'rejected' as const, reviewed_by: teacherId, reviewed_at: nowIso() }
        : row
    ));
  next.push({
    id: createId('enroll'),
    username: account?.username || current?.username || studentId,
    name: account?.name || current?.name || null,
    email: account?.username || current?.username || studentId,
    batch_id: destination.id,
    student_id: studentId,
    status: 'approved',
    requested_at: nowIso(),
    reviewed_by: teacherId,
    reviewed_at: nowIso(),
    notes: 'Moved by teacher',
  });
  saveEnrollments(next);
  return { status: 'moved', student_id: studentId, batch_id: destination.id };
};

export const removeStudentFromBatch = async (studentId: string): Promise<StudentRow | null> => {
  await ensureLocalDirectory();
  saveEnrollments(getEnrollments().map((row) => (
    row.student_id === studentId && row.status === 'approved'
      ? { ...row, status: 'rejected' as const, reviewed_at: nowIso() }
      : row
  )));
  const account = getAccounts().find((row) => row.id === studentId);
  return account ? toStudentRow(account, null) : null;
};

export const assignTestToBatches = async (testId: string, batchIds: string[]) => {
  await ensureLocalDirectory();
  const existing = getTestBatchLinks().filter((row) => row.test_id !== testId);
  const created = nowIso();
  const next = [
    ...existing,
    ...Array.from(new Set(batchIds)).map((batchId) => ({ test_id: testId, batch_id: batchId, created_at: created })),
  ];
  saveTestBatchLinks(next);
  return next.filter((row) => row.test_id === testId);
};

export const setTestBatches = assignTestToBatches;

export const getBatchesForTest = async (testId: string): Promise<BatchRow[]> => {
  await ensureLocalDirectory();
  const ids = new Set(getTestBatchLinks().filter((row) => row.test_id === testId).map((row) => row.batch_id));
  return getBatches().filter((batch) => ids.has(batch.id));
};

export const getTestIdsForBatch = async (batchId: string): Promise<string[]> => {
  await ensureLocalDirectory();
  return getTestBatchLinks().filter((row) => row.batch_id === batchId).map((row) => row.test_id);
};

export const isTestBatchScoped = async (testId: string): Promise<boolean> => {
  await ensureLocalDirectory();
  return getTestBatchLinks().some((row) => row.test_id === testId);
};

export const saveLocalTestResult = async (result: Omit<LocalTestResult, 'id' | 'completedAt'> & { completedAt?: string }) => {
  await ensureLocalDirectory();
  const row: LocalTestResult = {
    ...result,
    id: createId('result'),
    completedAt: result.completedAt || nowIso(),
  };
  saveLocalResults([row, ...getLocalResults()]);
  return row;
};

export const getLocalResultsForStudent = async (studentId: string): Promise<LocalTestResult[]> => {
  await ensureLocalDirectory();
  return getLocalResults()
    .filter((row) => row.studentId === studentId)
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
};

export const getLocalResultsForTest = async (testId: string): Promise<LocalTestResult[]> => {
  await ensureLocalDirectory();
  return getLocalResults()
    .filter((row) => row.testId === testId)
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
};

export const getLocalResultsForBatchTest = async (testId: string, batchId: string): Promise<LocalTestResult[]> => {
  await ensureLocalDirectory();
  return getLocalResults()
    .filter((row) => row.testId === testId && row.batchId === batchId)
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
};

export const hasLocalStudentTakenTest = async (testId: string, studentName: string): Promise<boolean> => {
  await ensureLocalDirectory();
  const needle = studentName.trim().toLocaleLowerCase();
  return getLocalResults().some((row) => (
    row.testId === testId && (
      row.studentUsername.toLocaleLowerCase() === needle
      || row.studentName.trim().toLocaleLowerCase() === needle
    )
  ));
};

export const localBatchLeaderboard = async (
  testId: string,
  batchId: string,
  scoreFn: (answers: unknown[]) => { score: number; totalMarks: number; percentage: number },
): Promise<BatchLeaderboardEntry[]> => {
  const rows = await getLocalResultsForBatchTest(testId, batchId);
  const entries = rows.map((row) => {
    const scored = scoreFn(row.answers);
    return {
      rank: 0,
      studentId: row.studentId,
      email: row.studentUsername,
      username: row.studentUsername,
      name: row.studentName,
      score: scored.score,
      totalMarks: scored.totalMarks,
      percentage: scored.percentage,
      completedAt: row.completedAt,
    };
  });
  entries.sort((a, b) => b.percentage - a.percentage);
  return entries.map((entry, index) => ({ ...entry, rank: index + 1 }));
};

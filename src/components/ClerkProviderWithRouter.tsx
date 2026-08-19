import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClerkProvider } from '@clerk/react';

// When VITE_ENABLE_CLERK is not 'true', the app falls back to the local
// username/password auth system (localAuth.ts) for both teachers and students.
// This avoids the 'Failed to load Clerk JS' crash that occurs with an invalid
// or unconfigured Clerk publishable key.
const CLERK_ENABLED = import.meta.env.VITE_ENABLE_CLERK === 'true';
const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

/**
 * Wraps ClerkProvider with React Router integration so Clerk's internal
 * navigation (e.g. sign-up redirects, sign-out redirects) goes through
 * React Router's `navigate` instead of `window.location`.
 *
 * Must be rendered inside `<BrowserRouter>`.
 *
 * Clerk is only initialized when VITE_ENABLE_CLERK=true and a publishable
 * key is present. Otherwise children render without Clerk, using the local
 * auth system exclusively.
 */
export const ClerkProviderWithRouter = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate();

  if (!CLERK_ENABLED || !PUBLISHABLE_KEY) {
    return <>{children}</>;
  }

  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      afterSignOutUrl="/"
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
    >
      {children}
    </ClerkProvider>
  );
};

export default ClerkProviderWithRouter;

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import ClerkProviderWithRouter from './components/ClerkProviderWithRouter'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'
import App from './App.tsx'
import './App.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ClerkProviderWithRouter>
          <App />
        </ClerkProviderWithRouter>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)

import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock next/navigation globally
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/chat/test',
  useSearchParams: () => new URLSearchParams(),
}))

// Polyfill sessionStorage for tests (jsdom provides it, but clear between tests)
beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
})

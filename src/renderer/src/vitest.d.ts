/**
 * Type definitions for @testing-library/jest-dom matchers
 */

import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers'
import 'vitest'

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Assertion<T = unknown> extends TestingLibraryMatchers<T, void> {}
}

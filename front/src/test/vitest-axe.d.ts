// `toHaveNoViolations` is registered at runtime by expect.extend in
// src/test/setup.ts, but its type has to be declared separately or `tsc -b`
// fails on a matcher it cannot see. The tests themselves pass either way,
// which is exactly the kind of gap the bare `tsc --noEmit` in this project
// would miss entirely.
//
// vitest-axe ships its own declaration, and it does not apply here: it
// augments `namespace Vi { interface Assertion<T> }`, which is how Vitest
// took custom matchers before version 3. Vitest 5 takes them through the
// `Matchers` interface on the module instead, so the augmentation below is
// written against the API actually installed rather than imported from the
// package.
declare module 'vitest' {
  interface Matchers<T = unknown> {
    toHaveNoViolations(): T;
  }
}

export {};

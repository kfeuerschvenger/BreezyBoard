import '@testing-library/jest-dom/vitest';
import { afterEach, expect, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as axeMatchers from 'vitest-axe/matchers';
import React from 'react';
import type { ReactNode } from 'react';

// The component layer of the accessibility gate. Registered globally so that any test can assert
// `expect(await axe(container)).toHaveNoViolations()` without ceremony,
// which is the point: a gate nobody can be bothered to reach for is not a
// gate.
expect.extend(axeMatchers);

// Unmount whatever the previous test rendered so assertions never leak
// between tests.
afterEach(() => {
  cleanup();
});

// motion is used across the app (TaskModal, Board, Column, TaskCard,
// UserAvatar, and more) purely for enter/exit transitions. Under jsdom there
// is no real layout or paint, so those transitions either no-op or keep an
// "exiting" element mounted until a requestAnimationFrame-driven animation
// resolves. Waiting on that timing in every test would make queries flaky
// (an element that is "about to disappear" is still in the DOM), so the
// whole library is mocked here: motion.* becomes a plain forwarded element
// with the animation-only props stripped off, and AnimatePresence becomes a
// passthrough that renders whatever is currently in the tree with no exit
// delay at all.
const MOTION_ONLY_PROPS = [
  'initial',
  'animate',
  'exit',
  'transition',
  'whileHover',
  'whileTap',
  'whileFocus',
  'whileDrag',
  'whileInView',
  'variants',
  'layout',
  'layoutId',
  'onAnimationStart',
  'onAnimationComplete',
] as const;

type AnyProps = Record<string, unknown>;

const stripMotionProps = (props: AnyProps): AnyProps => {
  const rest: AnyProps = { ...props };
  for (const key of MOTION_ONLY_PROPS) {
    delete rest[key];
  }
  return rest;
};

vi.mock('motion/react', () => {
  // The component for a given tag MUST be cached. Creating a new forwardRef on
  // every property access gives React a different element type on every render,
  // so it unmounts and remounts the whole subtree each time. In practice that
  // destroys the focused input after a single keystroke, which shows up as
  // typing that silently stops after one character.
  const componentsByTag = new Map<string, React.ComponentType<AnyProps>>();

  const motion = new Proxy(
    {},
    {
      get: (_target, tag) => {
        const tagName = String(tag);
        let Component = componentsByTag.get(tagName);
        if (!Component) {
          const Forwarded = React.forwardRef<unknown, AnyProps>((props, ref) =>
            React.createElement(tagName, { ...stripMotionProps(props), ref })
          );
          Forwarded.displayName = `motion.${tagName}`;
          Component = Forwarded as unknown as React.ComponentType<AnyProps>;
          componentsByTag.set(tagName, Component);
        }
        return Component;
      },
    }
  );

  const AnimatePresence = ({ children }: { children?: ReactNode }) =>
    React.createElement(React.Fragment, null, children);

  // Reduced motion is a policy of the real provider; here nothing animates.
  const MotionConfig = ({ children }: { children?: ReactNode }) => React.createElement(React.Fragment, null, children);

  // Nothing exits slowly here, so everything is always present.
  const usePresence = () => [true, undefined] as const;

  return { motion, AnimatePresence, MotionConfig, usePresence };
});

import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import React from 'react';
import type { ReactNode } from 'react';

// Unmount whatever the previous test rendered so assertions never leak
// between tests.
afterEach(() => {
  cleanup();
});

// framer-motion is used across the app (TaskDrawer, Board, Column, TaskCard,
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

vi.mock('framer-motion', () => {
  const motion = new Proxy(
    {},
    {
      get: (_target, tag) => {
        const tagName = String(tag);
        const Component = React.forwardRef<unknown, AnyProps>((props, ref) =>
          React.createElement(tagName, { ...stripMotionProps(props), ref })
        );
        Component.displayName = `motion.${tagName}`;
        return Component;
      },
    }
  );

  const AnimatePresence = ({ children }: { children?: ReactNode }) =>
    React.createElement(React.Fragment, null, children);

  return { motion, AnimatePresence };
});

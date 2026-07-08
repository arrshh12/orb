#!/usr/bin/env node

/**
 * Loom CLI entry point.
 * Parses arguments, checks dependencies, and launches the Ink wizard.
 */

import React from 'react';
import { render } from 'ink';
import meow from 'meow';
import { App } from './app.js';

const cli = meow(`
  Usage
    $ loom                    Start the fine-tuning wizard
    $ loom --resume <id>      Resume an interrupted training run
    $ loom --version          Show version

  Options
    --resume, -r     Resume from a previous training run
    --debug, -d      Show verbose debug output
    --force, -f      Skip memory fit checks (advanced)
    --help, -h       Show this help text

  Examples
    $ loom
    $ loom --debug
    $ loom --resume loom_run_2024-01-15
`, {
  importMeta: import.meta,
  flags: {
    resume: {
      type: 'string',
      shortFlag: 'r',
    },
    debug: {
      type: 'boolean',
      shortFlag: 'd',
      default: false,
    },
    force: {
      type: 'boolean',
      shortFlag: 'f',
      default: false,
    },
  },
});

// ─── Launch ──────────────────────────────────────────────────────────────────

const { waitUntilExit } = render(
  React.createElement(App, {
    resumeId: cli.flags.resume,
    debug: cli.flags.debug,
  }),
  {
    // Patch console so stray console.log doesn't break the UI
    patchConsole: true,
  },
);

await waitUntilExit();

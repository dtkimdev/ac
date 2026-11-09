#!/usr/bin/env node
'use strict';
/**
 * Claude's override (David, 2026-11-09): make main match this clone's version, replacing whatever was pushed last,
 * for example grokbot's newest push, without a force-push.
 *
 *   node portable/override.js "why" [path ...]
 *
 * No paths: every file on main becomes this clone's committed version.
 * Paths: only those files or folders; everything else keeps the latest pushed version.
 *
 * Commit what you want to keep first. The new commit has the latest main as its first parent, so the push is an
 * ordinary fast-forward. main's protection, the publisher and history all keep working. The overridden version stays
 * in history and comes back with: git revert -m 1 <override commit>
 *
 * Env: OVERRIDE_REMOTE (default origin), OVERRIDE_BRANCH (default main).
 */
const { execFileSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');

const remote = process.env.OVERRIDE_REMOTE || 'origin', branch = process.env.OVERRIDE_BRANCH || 'main';
const run = (args, opt = {}) => execFileSync('git', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opt, env: { ...process.env, ...(opt.env || {}) } }).trim();
const ok = (args) => { try { run(args); return true; } catch { return false; } };
const fail = (msg) => { console.error('OVERRIDE_FAIL ' + msg); process.exit(1); };
process.on('uncaughtException', (e) => fail(String(e.stderr || e.message).trim().split('\n')[0] + ' (nothing was pushed unless OVERRIDE_OK was printed)'));

const [reason, ...rawPaths] = process.argv.slice(2);
if (!reason) fail('usage: node portable/override.js "why" [path ...]');
const paths = rawPaths.map((p) => p.replace(/\\/g, '/').replace(/\/+$/, ''));
if (run(['status', '--porcelain', '--untracked-files=no'])) fail('uncommitted changes here: commit the version you want first');

for (let attempt = 1; attempt <= 3; attempt++) {
  run(['fetch', '-q', remote, branch]);
  const theirs = run(['rev-parse', 'FETCH_HEAD']), mine = run(['rev-parse', 'HEAD']);
  if (theirs === mine || ok(['merge-base', '--is-ancestor', theirs, mine])) {
    if (theirs !== mine) run(['push', '-q', remote, `${mine}:refs/heads/${branch}`]);
    console.log(`OVERRIDE_OK nothing to override: ${branch} is already behind this clone; pushed ${mine.slice(0, 7)}`);
    process.exit(0);
  }
  for (const p of paths) if (!ok(['cat-file', '-e', `${mine}:${p}`]) && !ok(['cat-file', '-e', `${theirs}:${p}`])) fail(`no such path in either version: ${p}`);

  let tree;
  if (!paths.length) tree = run(['rev-parse', `${mine}^{tree}`]);
  else { // start from the latest main, then swap in this clone's version of each path (or remove it, if this clone has none)
    const idx = path.join(os.tmpdir(), `override-${process.pid}.idx`), env = { GIT_INDEX_FILE: idx };
    try {
      run(['read-tree', theirs], { env });
      for (const p of paths) {
        run(['rm', '-r', '--cached', '-f', '-q', '--ignore-unmatch', '--', p], { env }); // temporary index only; -f skips the worktree comparison
        const entries = run(['ls-tree', '-r', mine, '--', p]);
        if (entries) run(['update-index', '--index-info'], { env, input: entries + '\n' });
      }
      tree = run(['write-tree'], { env });
    } finally { try { fs.unlinkSync(idx); } catch {} }
  }
  if (tree === run(['rev-parse', `${theirs}^{tree}`])) { console.log(`OVERRIDE_OK nothing differs from ${theirs.slice(0, 7)}; no commit made`); process.exit(0); }

  const who = run(['log', '-1', '--format=%an %h', theirs]), scope = paths.length ? `for ${paths.join(', ')}` : '(all files)';
  const msg = `Override ${who}: ${reason}\n\nReplaces ${theirs} ${scope} with Claude's version.\nRestore the overridden version: git revert -m 1 <this commit>\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  const commit = run(['commit-tree', tree, '-p', theirs, '-p', mine, '-m', msg]);
  if (!ok(['push', '-q', remote, `${commit}:refs/heads/${branch}`])) { console.log(`push rejected (someone pushed meanwhile), retry ${attempt}`); continue; }
  run(['merge', '-q', '--ff-only', commit]);
  console.log(`OVERRIDE_OK ${commit.slice(0, 7)} replaces ${who} ${scope}`);
  process.exit(0);
}
fail('main kept moving; tried 3 times. Nothing was changed');

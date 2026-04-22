# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-04-18

### Security

- **Fixed CWE-78 (OS Command Injection)** across all tool handlers in
  `src/index.ts`. User-controlled paths and rule fields are no longer
  interpolated into shell command strings. Reported by **BruceJin**
  (`brucejin@zju.edu.cn`) — see [#12](https://github.com/VetCoders/mcp-server-semgrep/issues/12).
- Replaced `child_process.exec()` with `child_process.execFile()` for every
  external invocation (`semgrep`, `pip3`). Arguments are now passed as arrays
  and never reach a shell.
- Replaced shell `cat`/`echo > file` with `fs.promises.readFile` /
  `fs.promises.writeFile` in `analyze_results`, `filter_results`,
  `export_results`, `compare_results`, and `create_rule`.
- Added defense-in-depth `validateNoShellMetacharacters` invoked from
  `validateAbsolutePath`. Rejects `;`, `|`, `&`, backticks, `$()`, `<>`, `{}`,
  `\`, `!`, `#`, `*`, `?`, `[`, `]`, quotes, `~`, and whitespace control
  characters before any value reaches the filesystem layer.
- Added structured validation for `create_rule`: `id`, `language`, `severity`
  are matched against strict allowlists; `pattern` and `message` are
  YAML-escaped via `JSON.stringify` to defeat YAML injection. (Originally
  flagged by Gemini Code Assist on PR #14.)
- Capped `semgrep` stdout buffer at 50 MiB and explicitly redact
  `SEMGREP_APP_TOKEN` in command-line logs.

### Changed

- Bumped version to `1.0.1`.
- Repository metadata now points at `VetCoders/mcp-server-semgrep`.
- Removed unused `axios` runtime dependency.
- Removed dead `src/config.ts` (was never imported by `src/index.ts`).
- Replaced stale tests (`tests/handlers.test.ts`, `tests/utils.test.ts` —
  imported modules that never existed) with `tests/security.test.ts`,
  including CWE-78 regression coverage and validator unit tests.

### Acknowledgements

- **BruceJin** (`BruceJqs`) — original vulnerability discovery and detailed
  CodeQL report.
- **xyaz1313** ([PR #13](https://github.com/VetCoders/mcp-server-semgrep/pull/13))
  and **karthikeyansundaram2**
  ([PR #14](https://github.com/VetCoders/mcp-server-semgrep/pull/14)) —
  independent fix proposals that informed the final patch.
- **Gemini Code Assist** — flagged token leak regression and YAML injection
  follow-ups in PR review.

## [1.0.0] - 2025-03-20

Initial public release. Now considered vulnerable — please upgrade to 1.0.1.

VibeCrafted with AI Agents (c)2026 VetCoders

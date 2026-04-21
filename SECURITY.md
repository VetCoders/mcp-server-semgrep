# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.0.1   | ✅ |
| 1.0.0   | ❌ (CVE candidate — see CHANGELOG) |
| < 1.0.0 | ❌ |

## Reporting a Vulnerability

We appreciate responsible disclosure. Please report security issues privately
through one of the following channels:

- **GitHub Security Advisory** (preferred):
  <https://github.com/VetCoders/mcp-server-semgrep/security/advisories/new>
- Email: `void@div0.space`

Please include:
- A clear description of the issue
- Steps to reproduce (PoC welcome, defanged if possible)
- Affected version(s)
- Suggested remediation, if you have one

We will acknowledge within 72 hours and aim to ship a fix within 14 days for
critical issues. We credit reporters in the changelog and (if you wish) in any
GHSA we publish.

## Hardening notes for operators

- This server is intended for **local-first** use over `stdio`. Do not expose
  the MCP transport to untrusted networks without an authenticated proxy in
  front.
- All path arguments are restricted to the configured workspace roots. By
  default this is `process.cwd()`. For desktop launchers and remote-managed
  installs, set `MCP_SERVER_SEMGREP_ALLOWED_ROOTS` to the smallest set of
  absolute directories the assistant should touch.
- `SEMGREP_APP_TOKEN`, when set, is forwarded to `semgrep` via `--oauth-token`
  using `child_process.execFile` (no shell) and is **redacted** in stderr
  logs. Treat the token as a secret and rotate it on suspected exposure.
- The container image installs `semgrep` at build time (`pip3 install
  --break-system-packages`). When running in production, prefer a pinned
  semgrep version and rebuild on upstream advisories.

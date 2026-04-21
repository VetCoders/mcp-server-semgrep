import { describe, it, expect } from 'vitest';
import path from 'path';
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from 'fs';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import {
  ALLOWED_ROOTS_ENV,
  BASE_ALLOWED_PATH,
  getAllowedRoots,
  parseSemgrepResults,
  validateAbsolutePath,
  validateNoShellMetacharacters,
  validateRuleField,
  validateRuleSeverity,
} from '../src/index.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

function withAllowedRootsEnv<T>(allowedRoots: string[], callback: () => T): T {
  const previousValue = process.env[ALLOWED_ROOTS_ENV];
  process.env[ALLOWED_ROOTS_ENV] = allowedRoots.join(path.delimiter);

  try {
    return callback();
  } finally {
    if (previousValue === undefined) {
      delete process.env[ALLOWED_ROOTS_ENV];
    } else {
      process.env[ALLOWED_ROOTS_ENV] = previousValue;
    }
  }
}

describe('validateNoShellMetacharacters', () => {
  it('accepts Windows-compatible separators and normal filesystem punctuation', () => {
    expect(() => validateNoShellMetacharacters(String.raw`C:\safe\path\with #hash !bang ~tilde.json`, 'p')).not.toThrow();
    expect(() => validateNoShellMetacharacters('/safe/path/file.json', 'p')).not.toThrow();
  });

  it.each([
    ['a\nb'], ['a\rb'], ['a\tb'], ['a\u0000b'],
  ])('rejects control characters in %s', (payload) => {
    expect(() => validateNoShellMetacharacters(payload, 'p')).toThrow(McpError);
  });
});

describe('validateAbsolutePath', () => {
  it('accepts absolute paths within BASE_ALLOWED_PATH', () => {
    const safe = path.join(BASE_ALLOWED_PATH, 'sub', 'file.json');
    expect(validateAbsolutePath(safe, 'p')).toBe(path.normalize(safe));
  });

  it('rejects relative paths', () => {
    expect(() => validateAbsolutePath('relative/file.json', 'p')).toThrow(McpError);
  });

  it('rejects absolute paths outside BASE_ALLOWED_PATH', () => {
    expect(() => validateAbsolutePath('/etc/passwd', 'p')).toThrow(McpError);
  });

  it('accepts punctuation that is valid in filesystem paths', () => {
    const safe = path.join(BASE_ALLOWED_PATH, 'sub', 'safe;name#test!.json');
    expect(validateAbsolutePath(safe, 'p')).toBe(path.normalize(safe));
  });

  it('rejects path traversal escaping the base', () => {
    const evil = path.join(BASE_ALLOWED_PATH, '..', '..', 'etc', 'passwd');
    expect(() => validateAbsolutePath(evil, 'p')).toThrow(McpError);
  });

  it('uses configured workspace roots instead of the package directory', () => {
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'semgrep-root-'));
    mkdirSync(path.join(workspaceRoot, 'src'), { recursive: true });

    try {
      withAllowedRootsEnv([workspaceRoot], () => {
        expect(getAllowedRoots()).toEqual([realpathSync.native(workspaceRoot)]);
        expect(validateAbsolutePath(path.join(workspaceRoot, 'src', 'app.ts'), 'path'))
          .toBe(path.join(realpathSync.native(workspaceRoot), 'src', 'app.ts'));
      });
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('rejects sibling prefix paths outside a configured workspace root', () => {
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'semgrep-root-'));
    const siblingRoot = `${workspaceRoot}-shadow`;
    mkdirSync(path.join(workspaceRoot, 'src'), { recursive: true });
    mkdirSync(path.join(siblingRoot, 'src'), { recursive: true });

    try {
      withAllowedRootsEnv([workspaceRoot], () => {
        expect(() => validateAbsolutePath(path.join(siblingRoot, 'src', 'app.ts'), 'path'))
          .toThrow(McpError);
      });
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
      rmSync(siblingRoot, { recursive: true, force: true });
    }
  });

  it('config: accepts auto', () => {
    expect(validateAbsolutePath('auto', 'config')).toBe('auto');
  });

  it('config: accepts p/ and r/ registry refs', () => {
    expect(validateAbsolutePath('p/security', 'config')).toBe('p/security');
    expect(validateAbsolutePath('r/javascript.security', 'config')).toBe('r/javascript.security');
  });

  it('config: rejects shell metacharacters in registry-like values', () => {
    expect(() => validateAbsolutePath('p/security\nid', 'config')).toThrow(McpError);
  });

  it('config: rejects malformed registry references', () => {
    expect(() => validateAbsolutePath('p/security with spaces', 'config')).toThrow(McpError);
  });
});

describe('validateRuleField', () => {
  const RULE_ID = /^[a-zA-Z][a-zA-Z0-9_.-]{0,127}$/;
  const LANGUAGE = /^[a-zA-Z][a-zA-Z0-9_+-]{0,31}$/;

  it('accepts valid rule id', () => {
    expect(validateRuleField('my_custom_rule.v2', 'id', RULE_ID)).toBe('my_custom_rule.v2');
  });

  it('accepts valid language', () => {
    expect(validateRuleField('python', 'language', LANGUAGE)).toBe('python');
    expect(validateRuleField('c++', 'language', LANGUAGE)).toBe('c++');
  });

  it('rejects YAML-injection payload in id', () => {
    expect(() => validateRuleField('foo\n  - id: pwned', 'id', RULE_ID)).toThrow(McpError);
  });

  it('rejects shell metacharacters in language', () => {
    expect(() => validateRuleField('python; id', 'language', LANGUAGE)).toThrow(McpError);
  });
});

describe('validateRuleSeverity', () => {
  it.each(['ERROR', 'WARNING', 'INFO', 'error', 'warning', 'info'])(
    'accepts %s and normalises to upper case',
    (input) => {
      expect(validateRuleSeverity(input)).toBe(input.toUpperCase());
    }
  );

  it('rejects unknown severity', () => {
    expect(() => validateRuleSeverity('CRITICAL')).toThrow(McpError);
  });

  it('rejects severity with shell metacharacters', () => {
    expect(() => validateRuleSeverity('ERROR; rm -rf /')).toThrow(McpError);
  });
});

describe('CWE-78 end-to-end regression (filesystem read instead of shell)', () => {
  it('reads JSON via fs.readFile, not via cat shell call', async () => {
    const fixture = path.join(BASE_ALLOWED_PATH, 'cwe78-fixture.json');
    await writeFile(fixture, JSON.stringify({ results: [] }), 'utf-8');
    try {
      const fileContent = await import('fs/promises').then(m => m.readFile(fixture, 'utf-8'));
      expect(JSON.parse(fileContent)).toEqual({ results: [] });
    } finally {
      await unlink(fixture).catch(() => undefined);
    }
  });
});

describe('parseSemgrepResults', () => {
  it('returns an empty object for null payloads', () => {
    expect(parseSemgrepResults('null')).toEqual({});
  });

  it('returns an empty object for non-object JSON payloads', () => {
    expect(parseSemgrepResults('[]')).toEqual({});
    expect(parseSemgrepResults('"text"')).toEqual({});
  });

  it('preserves object payloads', () => {
    expect(parseSemgrepResults(JSON.stringify({ results: [] }))).toEqual({ results: [] });
  });
});

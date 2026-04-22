import { beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { execFileSync } from 'child_process';
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const testFilePath = fileURLToPath(import.meta.url);
const testsDir = path.dirname(testFilePath);
const repoRoot = path.resolve(testsDir, '..');
const buildEntry = path.join(repoRoot, 'build', 'index.js');

function createFakeSemgrepBinary(): string {
  const binDir = mkdtempSync(path.join(tmpdir(), 'semgrep-bin-'));
  const semgrepPath = path.join(binDir, 'semgrep');

  writeFileSync(
    semgrepPath,
    [
      '#!/bin/sh',
      'if [ "$1" = "--version" ]; then',
      '  echo "0.0.0-test"',
      '  exit 0',
      'fi',
      'exit 1',
      '',
    ].join('\n'),
    'utf-8'
  );
  chmodSync(semgrepPath, 0o755);

  return binDir;
}

beforeAll(() => {
  execFileSync('npm', ['run', 'build'], {
    cwd: repoRoot,
    stdio: 'pipe',
  });
});

describe('stdio smoke', () => {
  it('boots against a consumer workspace root and enforces it over MCP stdio', async () => {
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'semgrep-stdio-workspace-'));
    const outsideRoot = mkdtempSync(path.join(tmpdir(), 'semgrep-stdio-outside-'));
    const fakeSemgrepDir = createFakeSemgrepBinary();
    const resultsFile = path.join(workspaceRoot, 'results.json');
    const outsideResultsFile = path.join(outsideRoot, 'results.json');
    const stderrChunks: string[] = [];

    writeFileSync(resultsFile, JSON.stringify({
      results: [{ check_id: 'demo.rule', extra: { severity: 'WARNING' } }],
    }));
    writeFileSync(outsideResultsFile, JSON.stringify({ results: [] }));
    mkdirSync(path.join(workspaceRoot, 'src'), { recursive: true });

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [buildEntry],
      cwd: workspaceRoot,
      stderr: 'pipe',
      env: {
        PATH: `${fakeSemgrepDir}${path.delimiter}${process.env.PATH ?? ''}`,
      },
    });

    transport.stderr?.on('data', (chunk) => {
      stderrChunks.push(String(chunk));
    });

    const client = new Client({
      name: 'stdio-smoke-test',
      version: '1.0.0',
    });

    try {
      await client.connect(transport);

      const toolList = await client.listTools();
      expect(toolList.tools.map((tool) => tool.name)).toContain('analyze_results');

      const analysis = await client.callTool({
        name: 'analyze_results',
        arguments: { results_file: resultsFile },
      });
      const textContent = analysis.content[0];

      expect(textContent?.type).toBe('text');
      expect(JSON.parse(textContent?.type === 'text' ? textContent.text : '{}')).toMatchObject({
        total_findings: 1,
        by_severity: { WARNING: 1 },
        by_rule: { 'demo.rule': 1 },
      });

      await expect(client.callTool({
        name: 'analyze_results',
        arguments: { results_file: outsideResultsFile },
      })).rejects.toThrow(/allowed workspace root/i);
    } catch (error) {
      const stderrOutput = stderrChunks.join('').trim();
      if (stderrOutput) {
        throw new Error(`${String(error)}\n\nServer stderr:\n${stderrOutput}`);
      }
      throw error;
    } finally {
      await client.close().catch(() => undefined);
      rmSync(workspaceRoot, { recursive: true, force: true });
      rmSync(outsideRoot, { recursive: true, force: true });
      rmSync(fakeSemgrepDir, { recursive: true, force: true });
    }
  }, 20000);
});

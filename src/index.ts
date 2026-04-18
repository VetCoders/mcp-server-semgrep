#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const BASE_ALLOWED_PATH = path.resolve(__dirname, '../..');

const SEMGREP_MAX_BUFFER = 50 * 1024 * 1024;

const SHELL_METACHARACTERS = /[;&|`$()<>{}\\!#\n\r\t*?[\]"'~]/;

const ALLOWED_SEVERITY = new Set(['ERROR', 'WARNING', 'INFO']);
const ALLOWED_LANGUAGE = /^[a-zA-Z][a-zA-Z0-9_+-]{0,31}$/;
const ALLOWED_RULE_ID = /^[a-zA-Z][a-zA-Z0-9_.-]{0,127}$/;

export function validateNoShellMetacharacters(value: string, paramName: string): void {
  if (SHELL_METACHARACTERS.test(value)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `${paramName} contains characters that are not allowed`
    );
  }
}

export function validateAbsolutePath(pathToValidate: string, paramName: string): string {
  if (paramName === 'config' && (
    pathToValidate.startsWith('p/') ||
    pathToValidate.startsWith('r/') ||
    pathToValidate === 'auto'
  )) {
    validateNoShellMetacharacters(pathToValidate, paramName);
    return pathToValidate;
  }

  if (!path.isAbsolute(pathToValidate)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `${paramName} must be an absolute path. Received: ${pathToValidate}`
    );
  }

  const normalizedPath = path.normalize(pathToValidate);

  if (!path.isAbsolute(normalizedPath)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `${paramName} contains invalid path traversal sequences`
    );
  }

  if (!normalizedPath.startsWith(BASE_ALLOWED_PATH)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `${paramName} must be within the MCP directory (${BASE_ALLOWED_PATH})`
    );
  }

  validateNoShellMetacharacters(normalizedPath, paramName);
  return normalizedPath;
}

export function validateRuleField(
  value: string,
  paramName: string,
  pattern: RegExp
): string {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `${paramName} contains invalid characters or exceeds allowed format`
    );
  }
  return value;
}

export function validateRuleSeverity(value: string): string {
  const upper = String(value).toUpperCase();
  if (!ALLOWED_SEVERITY.has(upper)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `severity must be one of: ${Array.from(ALLOWED_SEVERITY).join(', ')}`
    );
  }
  return upper;
}

function escapeYamlScalar(value: string): string {
  if (typeof value !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, 'YAML scalar value must be a string');
  }
  return JSON.stringify(value);
}

class SemgrepServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'mcp-server-semgrep',
        version: '1.0.1',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();

    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private async checkSemgrepInstallation(): Promise<boolean> {
    try {
      await execFileAsync('semgrep', ['--version']);
      return true;
    } catch (error) {
      return false;
    }
  }

  private async installSemgrep(): Promise<void> {
    console.error('Installing Semgrep...');
    try {
      await execFileAsync('pip3', ['--version']);
    } catch (error) {
      throw new Error('Python/pip3 is not installed. Please install Python and pip3.');
    }

    try {
      await execFileAsync('pip3', ['install', 'semgrep']);
      console.error('Semgrep was successfully installed');
    } catch (error: any) {
      throw new Error(`Error installing Semgrep: ${error.message}`);
    }
  }

  private async ensureSemgrepAvailable(): Promise<void> {
    const isInstalled = await this.checkSemgrepInstallation();
    if (!isInstalled) {
      await this.installSemgrep();
    }
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'scan_directory',
          description: 'Performs a Semgrep scan on a directory',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Absolute path to the directory to scan (must be within MCP directory)'
              },
              config: {
                type: 'string',
                description: 'Semgrep configuration (e.g. "auto" or absolute path to rule file)',
                default: 'auto'
              }
            },
            required: ['path']
          }
        },
        {
          name: 'list_rules',
          description: 'Lists available Semgrep rules',
          inputSchema: {
            type: 'object',
            properties: {
              language: {
                type: 'string',
                description: 'Programming language for rules (optional)'
              }
            }
          }
        },
        {
          name: 'analyze_results',
          description: 'Analyzes scan results',
          inputSchema: {
            type: 'object',
            properties: {
              results_file: {
                type: 'string',
                description: 'Absolute path to JSON results file (must be within MCP directory)'
              }
            },
            required: ['results_file']
          }
        },
        {
          name: 'create_rule',
          description: 'Creates a new Semgrep rule',
          inputSchema: {
            type: 'object',
            properties: {
              output_path: { type: 'string', description: 'Absolute path for output rule file' },
              pattern: { type: 'string', description: 'Search pattern for the rule' },
              language: { type: 'string', description: 'Target language for the rule' },
              message: { type: 'string', description: 'Message to display when rule matches' },
              severity: {
                type: 'string',
                description: 'Rule severity (ERROR, WARNING, INFO)',
                default: 'WARNING'
              },
              id: {
                type: 'string',
                description: 'Rule identifier',
                default: 'custom_rule'
              }
            },
            required: ['output_path', 'pattern', 'language', 'message']
          }
        },
        {
          name: 'filter_results',
          description: 'Filters scan results by various criteria',
          inputSchema: {
            type: 'object',
            properties: {
              results_file: { type: 'string', description: 'Absolute path to JSON results file' },
              severity: { type: 'string', description: 'Filter by severity (ERROR, WARNING, INFO)' },
              rule_id: { type: 'string', description: 'Filter by rule ID' },
              path_pattern: { type: 'string', description: 'Filter by file path pattern (regex)' },
              language: { type: 'string', description: 'Filter by programming language' },
              message_pattern: { type: 'string', description: 'Filter by message content (regex)' }
            },
            required: ['results_file']
          }
        },
        {
          name: 'export_results',
          description: 'Exports scan results in various formats',
          inputSchema: {
            type: 'object',
            properties: {
              results_file: { type: 'string', description: 'Absolute path to JSON results file' },
              output_file: { type: 'string', description: 'Absolute path to output file' },
              format: {
                type: 'string',
                description: 'Output format (json, sarif, text)',
                default: 'text'
              }
            },
            required: ['results_file', 'output_file']
          }
        },
        {
          name: 'compare_results',
          description: 'Compares two scan results',
          inputSchema: {
            type: 'object',
            properties: {
              old_results: { type: 'string', description: 'Absolute path to older JSON results file' },
              new_results: { type: 'string', description: 'Absolute path to newer JSON results file' }
            },
            required: ['old_results', 'new_results']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      await this.ensureSemgrepAvailable();

      switch (request.params.name) {
      case 'scan_directory':
        return await this.handleScanDirectory(request.params.arguments);
      case 'list_rules':
        return await this.handleListRules(request.params.arguments);
      case 'analyze_results':
        return await this.handleAnalyzeResults(request.params.arguments);
      case 'create_rule':
        return await this.handleCreateRule(request.params.arguments);
      case 'filter_results':
        return await this.handleFilterResults(request.params.arguments);
      case 'export_results':
        return await this.handleExportResults(request.params.arguments);
      case 'compare_results':
        return await this.handleCompareResults(request.params.arguments);
      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${request.params.name}`
        );
      }
    });
  }

  private async handleScanDirectory(args: any) {
    if (!args.path) {
      throw new McpError(ErrorCode.InvalidParams, 'Path is required');
    }

    const scanPath = validateAbsolutePath(args.path, 'path');
    const config = args.config || 'auto';
    const configParam = validateAbsolutePath(config, 'config');

    try {
      // Use execFile with arg array to prevent shell injection (CWE-78 fix)
      const semgrepArgs = ['scan', '--json', '--config', configParam, scanPath];

      if (process.env.SEMGREP_APP_TOKEN && config.startsWith('r/')) {
        semgrepArgs.splice(1, 0, '--oauth-token', process.env.SEMGREP_APP_TOKEN);
      }

      const loggedArgs = semgrepArgs.map((arg, idx) =>
        idx > 0 && semgrepArgs[idx - 1] === '--oauth-token' ? '[REDACTED]' : arg
      );
      console.error(`Executing: semgrep ${loggedArgs.join(' ')}`);

      const { stdout } = await execFileAsync('semgrep', semgrepArgs, {
        maxBuffer: SEMGREP_MAX_BUFFER,
      });

      return {
        content: [{ type: 'text', text: stdout }]
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `Error scanning: ${error.message}` }],
        isError: true
      };
    }
  }

  private async handleListRules(args: any) {
    try {
      const hasToken = Boolean(process.env.SEMGREP_APP_TOKEN);
      const languageNote = args.language && ALLOWED_LANGUAGE.test(args.language)
        ? `\n(Filter requested for language: ${args.language})\n`
        : '';

      let rulesList = `Available Semgrep Registry Rules:
${languageNote}
Standard rule collections:
- p/ci: Basic CI rules
- p/security: Security rules
- p/performance: Performance rules
- p/best-practices: Best practice rules
`;

      if (hasToken) {
        rulesList += `
Pro Rule Collections (available with your SEMGREP_APP_TOKEN):
- r/java.lang.security.audit.crypto.ssl.weak-protocol
- r/javascript.express.security.audit.cookie-session-no-secure
- r/go.lang.security.audit.crypto.bad_imports
- And many more...
`;
      }

      rulesList += `
Use these rule collections with --config, e.g.:
semgrep scan --config=p/ci`;

      return {
        content: [{ type: 'text', text: rulesList }]
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `Error retrieving rules: ${error.message}` }],
        isError: true
      };
    }
  }

  private async handleAnalyzeResults(args: any) {
    if (!args.results_file) {
      throw new McpError(ErrorCode.InvalidParams, 'Results file is required');
    }

    const resultsFile = validateAbsolutePath(args.results_file, 'results_file');

    try {
      const fileContent = await readFile(resultsFile, 'utf-8');
      const results = JSON.parse(fileContent);

      const summary = {
        total_findings: results.results?.length || 0,
        by_severity: {} as Record<string, number>,
        by_rule: {} as Record<string, number>
      };

      for (const finding of results.results || []) {
        const severity = finding.extra?.severity || 'unknown';
        const rule = finding.check_id || 'unknown';
        summary.by_severity[severity] = (summary.by_severity[severity] || 0) + 1;
        summary.by_rule[rule] = (summary.by_rule[rule] || 0) + 1;
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }]
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `Error analyzing results: ${error.message}` }],
        isError: true
      };
    }
  }

  private async handleCreateRule(args: any) {
    if (!args.output_path || !args.pattern || !args.language || !args.message) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'output_path, pattern, language and message are required'
      );
    }

    const outputPath = validateAbsolutePath(args.output_path, 'output_path');
    const id = validateRuleField(args.id ?? 'custom_rule', 'id', ALLOWED_RULE_ID);
    const language = validateRuleField(args.language, 'language', ALLOWED_LANGUAGE);
    const severity = validateRuleSeverity(args.severity ?? 'WARNING');

    // escapeYamlScalar uses JSON.stringify to escape user values, preventing YAML injection
    const ruleYaml = [
      'rules:',
      `  - id: ${id}`,
      `    pattern: ${escapeYamlScalar(args.pattern)}`,
      `    message: ${escapeYamlScalar(args.message)}`,
      `    languages: [${language}]`,
      `    severity: ${severity}`,
      ''
    ].join('\n');

    try {
      await writeFile(outputPath, ruleYaml, 'utf-8');
      return {
        content: [{ type: 'text', text: `Rule successfully created at ${outputPath}` }]
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `Error creating rule: ${error.message}` }],
        isError: true
      };
    }
  }

  private async handleFilterResults(args: any) {
    if (!args.results_file) {
      throw new McpError(ErrorCode.InvalidParams, 'results_file is required');
    }

    const resultsFile = validateAbsolutePath(args.results_file, 'results_file');

    try {
      const fileContent = await readFile(resultsFile, 'utf-8');
      const results = JSON.parse(fileContent);

      let filteredResults = results.results || [];

      if (args.severity) {
        filteredResults = filteredResults.filter(
          (finding: any) => finding.extra?.severity === args.severity
        );
      }

      if (args.rule_id) {
        filteredResults = filteredResults.filter(
          (finding: any) => finding.check_id === args.rule_id
        );
      }

      if (args.path_pattern) {
        const pathRegex = new RegExp(args.path_pattern);
        filteredResults = filteredResults.filter(
          (finding: any) => pathRegex.test(finding.path)
        );
      }

      if (args.language) {
        filteredResults = filteredResults.filter(
          (finding: any) => finding.extra?.metadata?.language === args.language
        );
      }

      if (args.message_pattern) {
        const messageRegex = new RegExp(args.message_pattern);
        filteredResults = filteredResults.filter(
          (finding: any) => messageRegex.test(finding.extra?.message ?? '')
        );
      }

      return {
        content: [{ type: 'text', text: JSON.stringify({ results: filteredResults }, null, 2) }]
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `Error filtering results: ${error.message}` }],
        isError: true
      };
    }
  }

  private async handleExportResults(args: any) {
    if (!args.results_file || !args.output_file) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'results_file and output_file are required'
      );
    }

    const resultsFile = validateAbsolutePath(args.results_file, 'results_file');
    const outputFile = validateAbsolutePath(args.output_file, 'output_file');
    const format = args.format || 'text';

    try {
      const fileContent = await readFile(resultsFile, 'utf-8');
      const results = JSON.parse(fileContent);
      const findings = results.results || [];

      let output = '';
      switch (format) {
      case 'json':
        output = JSON.stringify(results, null, 2);
        break;
      case 'sarif': {
        const sarifOutput = {
          $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
          version: '2.1.0',
          runs: [{
            tool: {
              driver: {
                name: 'semgrep',
                rules: findings.map((r: any) => ({
                  id: r.check_id,
                  name: r.check_id,
                  shortDescription: { text: r.extra?.message ?? '' },
                  defaultConfiguration: {
                    level: r.extra?.severity === 'ERROR' ? 'error' : 'warning'
                  }
                }))
              }
            },
            results: findings.map((r: any) => ({
              ruleId: r.check_id,
              message: { text: r.extra?.message ?? '' },
              locations: [{
                physicalLocation: {
                  artifactLocation: { uri: r.path },
                  region: {
                    startLine: r.start?.line,
                    startColumn: r.start?.col,
                    endLine: r.end?.line,
                    endColumn: r.end?.col
                  }
                }
              }]
            }))
          }]
        };
        output = JSON.stringify(sarifOutput, null, 2);
        break;
      }
      case 'text':
      default:
        output = findings.map((r: any) =>
          `[${r.extra?.severity ?? 'unknown'}] ${r.check_id}\n` +
          `File: ${r.path}\n` +
          `Lines: ${r.start?.line}-${r.end?.line}\n` +
          `Message: ${r.extra?.message ?? ''}\n` +
          '-------------------'
        ).join('\n');
        break;
      }

      await writeFile(outputFile, output, 'utf-8');
      return {
        content: [{ type: 'text', text: `Results successfully exported to ${outputFile}` }]
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `Error exporting results: ${error.message}` }],
        isError: true
      };
    }
  }

  private async handleCompareResults(args: any) {
    if (!args.old_results || !args.new_results) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'old_results and new_results are required'
      );
    }

    const oldResultsFile = validateAbsolutePath(args.old_results, 'old_results');
    const newResultsFile = validateAbsolutePath(args.new_results, 'new_results');

    try {
      const [oldContent, newContent] = await Promise.all([
        readFile(oldResultsFile, 'utf-8'),
        readFile(newResultsFile, 'utf-8'),
      ]);

      const oldResults = JSON.parse(oldContent).results || [];
      const newResults = JSON.parse(newContent).results || [];

      const oldFindings = new Set(oldResults.map((r: any) =>
        `${r.check_id}:${r.path}:${r.start?.line}:${r.start?.col}`
      ));

      const comparison = {
        total_old: oldResults.length,
        total_new: newResults.length,
        added: [] as any[],
        removed: [] as any[],
        unchanged: [] as any[]
      };

      newResults.forEach((finding: any) => {
        const key = `${finding.check_id}:${finding.path}:${finding.start?.line}:${finding.start?.col}`;
        if (oldFindings.has(key)) {
          comparison.unchanged.push(finding);
        } else {
          comparison.added.push(finding);
        }
      });

      const newKeys = new Set(newResults.map((r: any) =>
        `${r.check_id}:${r.path}:${r.start?.line}:${r.start?.col}`
      ));
      oldResults.forEach((finding: any) => {
        const key = `${finding.check_id}:${finding.path}:${finding.start?.line}:${finding.start?.col}`;
        if (!newKeys.has(key)) {
          comparison.removed.push(finding);
        }
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            summary: {
              old_findings: comparison.total_old,
              new_findings: comparison.total_new,
              added: comparison.added.length,
              removed: comparison.removed.length,
              unchanged: comparison.unchanged.length
            },
            details: comparison
          }, null, 2)
        }]
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `Error comparing results: ${error.message}` }],
        isError: true
      };
    }
  }

  async run() {
    try {
      await this.ensureSemgrepAvailable();
    } catch (error: any) {
      console.error(`Error setting up Semgrep: ${error.message}`);
      process.exit(1);
    }

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('MCP Server Semgrep running on stdio');
  }
}

const isEntrypoint = (() => {
  try {
    return process.argv[1] && path.resolve(process.argv[1]) === __filename;
  } catch {
    return false;
  }
})();

if (isEntrypoint) {
  const server = new SemgrepServer();
  server.run().catch(console.error);
}

export { SemgrepServer };

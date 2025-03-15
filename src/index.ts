#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);

// Determine the MCP directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_ALLOWED_PATH = path.resolve(__dirname, '../..');

class SemgrepServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'semgrep-server',
        version: '0.1.0',
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
      await execAsync('semgrep --version');
      return true;
    } catch (error) {
      return false;
    }
  }

  private async installSemgrep(): Promise<void> {
    console.error('Installing Semgrep...');
    try {
      // Check if pip is installed
      await execAsync('pip3 --version');
    } catch (error) {
      throw new Error('Python/pip3 is not installed. Please install Python and pip3.');
    }

    try {
      // Install Semgrep via pip
      await execAsync('pip3 install semgrep');
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

  private validateAbsolutePath(pathToValidate: string, paramName: string): string {
    // Skip validation for special configuration values like "p/security"
    if (paramName === 'config' && (pathToValidate.startsWith('p/') || pathToValidate.startsWith('r/') || pathToValidate === 'auto')) {
      return pathToValidate;
    }
    
    if (!path.isAbsolute(pathToValidate)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `${paramName} must be an absolute path. Received: ${pathToValidate}`
      );
    }

    // Normalize the path and ensure no path traversal is possible
    const normalizedPath = path.normalize(pathToValidate);
    
    // Check if the normalized path is still absolute
    if (!path.isAbsolute(normalizedPath)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `${paramName} contains invalid path traversal sequences`
      );
    }

    // Check if the path is within the allowed base directory
    if (!normalizedPath.startsWith(BASE_ALLOWED_PATH)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `${paramName} must be within the MCP directory (${BASE_ALLOWED_PATH})`
      );
    }

    return normalizedPath;
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
                description: `Absolute path to the directory to scan (must be within MCP directory)`
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
                description: `Absolute path to JSON results file (must be within MCP directory)`
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
              output_path: {
                type: 'string',
                description: 'Absolute path for output rule file'
              },
              pattern: {
                type: 'string',
                description: 'Search pattern for the rule'
              },
              language: {
                type: 'string',
                description: 'Target language for the rule'
              },
              message: {
                type: 'string',
                description: 'Message to display when rule matches'
              },
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
              results_file: {
                type: 'string',
                description: 'Absolute path to JSON results file'
              },
              severity: {
                type: 'string',
                description: 'Filter by severity (ERROR, WARNING, INFO)'
              },
              rule_id: {
                type: 'string',
                description: 'Filter by rule ID'
              },
              path_pattern: {
                type: 'string',
                description: 'Filter by file path pattern (regex)'
              },
              language: {
                type: 'string',
                description: 'Filter by programming language'
              },
              message_pattern: {
                type: 'string',
                description: 'Filter by message content (regex)'
              }
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
              results_file: {
                type: 'string',
                description: 'Absolute path to JSON results file'
              },
              output_file: {
                type: 'string',
                description: 'Absolute path to output file'
              },
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
              old_results: {
                type: 'string',
                description: 'Absolute path to older JSON results file'
              },
              new_results: {
                type: 'string',
                description: 'Absolute path to newer JSON results file'
              }
            },
            required: ['old_results', 'new_results']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      // Ensure Semgrep is available before executing any tool
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

    const scanPath = this.validateAbsolutePath(args.path, 'path');
    const config = args.config || 'auto';
    
    // Use validateAbsolutePath which now handles special config values
    const configParam = this.validateAbsolutePath(config, 'config');

    try {
      // Check for SEMGREP_APP_TOKEN in environment
      let cmd = `semgrep scan --json --config ${configParam} ${scanPath}`;
      
      // Add token if available - note that Semgrep CLI might use different formats 
      // for different versions, so we'll try both environment variable and flag approaches
      if (process.env.SEMGREP_APP_TOKEN) {
        // First approach: Set environment for child process
        const env = { ...process.env };
        
        // Second approach: Try adding the flag  
        // Some Semgrep versions accept --oauth-token instead of --auth-token
        if (config.startsWith('r/')) {
          // For Pro rules, we definitely need the token
          cmd = `semgrep scan --json --oauth-token ${process.env.SEMGREP_APP_TOKEN} --config ${configParam} ${scanPath}`;
        }
      }
      
      console.error(`Executing: ${cmd.replace(process.env.SEMGREP_APP_TOKEN || '', '[REDACTED]')}`);
      const { stdout, stderr } = await execAsync(cmd);

      return {
        content: [
          {
            type: 'text',
            text: stdout
          }
        ]
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Error scanning: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }

  private async handleListRules(args: any) {
    const languageFilter = args.language ? `--lang ${args.language}` : '';
    try {
      // Check for SEMGREP_APP_TOKEN in environment
      const hasToken = process.env.SEMGREP_APP_TOKEN ? true : false;
      
      // Build the rules list with standard rules
      let rulesList = `Available Semgrep Registry Rules:

Standard rule collections:
- p/ci: Basic CI rules
- p/security: Security rules
- p/performance: Performance rules
- p/best-practices: Best practice rules
`;

      // Add Pro rules information if token is available
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
        content: [
          {
            type: 'text',
            text: rulesList
          }
        ]
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Error retrieving rules: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }

  private async handleAnalyzeResults(args: any) {
    if (!args.results_file) {
      throw new McpError(ErrorCode.InvalidParams, 'Results file is required');
    }

    const resultsFile = this.validateAbsolutePath(args.results_file, 'results_file');

    try {
      const { stdout } = await execAsync(`cat ${resultsFile}`);
      const results = JSON.parse(stdout);
      
      // Simple analysis of the results
      const summary = {
        total_findings: results.results?.length || 0,
        by_severity: {} as Record<string, number>,
        by_rule: {} as Record<string, number>
      };

      for (const finding of results.results || []) {
        const severity = finding.extra.severity || 'unknown';
        const rule = finding.check_id || 'unknown';

        summary.by_severity[severity] = (summary.by_severity[severity] || 0) + 1;
        summary.by_rule[rule] = (summary.by_rule[rule] || 0) + 1;
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(summary, null, 2)
          }
        ]
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Error analyzing results: ${error.message}`
          }
        ],
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

    const outputPath = this.validateAbsolutePath(args.output_path, 'output_path');
    const severity = args.severity || 'WARNING';
    const id = args.id || 'custom_rule';

    // Create YAML rule
    const ruleYaml = `
rules:
  - id: ${id}
    pattern: ${args.pattern}
    message: ${args.message}
    languages: [${args.language}]
    severity: ${severity}
`;

    try {
      await execAsync(`echo '${ruleYaml}' > ${outputPath}`);
      return {
        content: [
          {
            type: 'text',
            text: `Rule successfully created at ${outputPath}`
          }
        ]
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Error creating rule: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }

  private async handleFilterResults(args: any) {
    if (!args.results_file) {
      throw new McpError(ErrorCode.InvalidParams, 'results_file is required');
    }

    const resultsFile = this.validateAbsolutePath(args.results_file, 'results_file');

    try {
      const { stdout } = await execAsync(`cat ${resultsFile}`);
      const results = JSON.parse(stdout);
      
      let filteredResults = results.results || [];

      // Filter by severity
      if (args.severity) {
        filteredResults = filteredResults.filter(
          (finding: any) => finding.extra.severity === args.severity
        );
      }

      // Filter by rule ID
      if (args.rule_id) {
        filteredResults = filteredResults.filter(
          (finding: any) => finding.check_id === args.rule_id
        );
      }

      // Filter by path pattern
      if (args.path_pattern) {
        const pathRegex = new RegExp(args.path_pattern);
        filteredResults = filteredResults.filter(
          (finding: any) => pathRegex.test(finding.path)
        );
      }
      
      // Filter by language
      if (args.language) {
        filteredResults = filteredResults.filter(
          (finding: any) => finding.extra.metadata?.language === args.language
        );
      }
      
      // Filter by message pattern
      if (args.message_pattern) {
        const messageRegex = new RegExp(args.message_pattern);
        filteredResults = filteredResults.filter(
          (finding: any) => messageRegex.test(finding.extra.message)
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ results: filteredResults }, null, 2)
          }
        ]
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Error filtering results: ${error.message}`
          }
        ],
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

    const resultsFile = this.validateAbsolutePath(args.results_file, 'results_file');
    const outputFile = this.validateAbsolutePath(args.output_file, 'output_file');
    const format = args.format || 'text';

    try {
      const { stdout } = await execAsync(`cat ${resultsFile}`);
      const results = JSON.parse(stdout);

      let output = '';
      switch (format) {
        case 'json':
          output = JSON.stringify(results, null, 2);
          break;
        case 'sarif':
          // Create SARIF format
          const sarifOutput = {
            $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
            version: "2.1.0",
            runs: [{
              tool: {
                driver: {
                  name: "semgrep",
                  rules: results.results.map((r: any) => ({
                    id: r.check_id,
                    name: r.check_id,
                    shortDescription: {
                      text: r.extra.message
                    },
                    defaultConfiguration: {
                      level: r.extra.severity === 'ERROR' ? 'error' : 'warning'
                    }
                  }))
                }
              },
              results: results.results.map((r: any) => ({
                ruleId: r.check_id,
                message: {
                  text: r.extra.message
                },
                locations: [{
                  physicalLocation: {
                    artifactLocation: {
                      uri: r.path
                    },
                    region: {
                      startLine: r.start.line,
                      startColumn: r.start.col,
                      endLine: r.end.line,
                      endColumn: r.end.col
                    }
                  }
                }]
              }))
            }]
          };
          output = JSON.stringify(sarifOutput, null, 2);
          break;
        case 'text':
        default:
          // Human readable format
          output = results.results.map((r: any) =>
            `[${r.extra.severity}] ${r.check_id}\n` +
            `File: ${r.path}\n` +
            `Lines: ${r.start.line}-${r.end.line}\n` +
            `Message: ${r.extra.message}\n` +
            '-------------------'
          ).join('\n');
          break;
      }

      await execAsync(`echo '${output}' > ${outputFile}`);
      return {
        content: [
          {
            type: 'text',
            text: `Results successfully exported to ${outputFile}`
          }
        ]
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Error exporting results: ${error.message}`
          }
        ],
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

    const oldResultsFile = this.validateAbsolutePath(args.old_results, 'old_results');
    const newResultsFile = this.validateAbsolutePath(args.new_results, 'new_results');

    try {
      const { stdout: oldContent } = await execAsync(`cat ${oldResultsFile}`);
      const { stdout: newContent } = await execAsync(`cat ${newResultsFile}`);
      
      const oldResults = JSON.parse(oldContent).results || [];
      const newResults = JSON.parse(newContent).results || [];

      // Compare findings
      const oldFindings = new Set(oldResults.map((r: any) =>
        `${r.check_id}:${r.path}:${r.start.line}:${r.start.col}`
      ));

      const comparison = {
        total_old: oldResults.length,
        total_new: newResults.length,
        added: [] as any[],
        removed: [] as any[],
        unchanged: [] as any[]
      };

      // Identify new and unchanged findings
      newResults.forEach((finding: any) => {
        const key = `${finding.check_id}:${finding.path}:${finding.start.line}:${finding.start.col}`;
        if (oldFindings.has(key)) {
          comparison.unchanged.push(finding);
        } else {
          comparison.added.push(finding);
        }
      });

      // Identify removed findings
      oldResults.forEach((finding: any) => {
        const key = `${finding.check_id}:${finding.path}:${finding.start.line}:${finding.start.col}`;
        const exists = newResults.some((newFinding: any) =>
          `${newFinding.check_id}:${newFinding.path}:${newFinding.start.line}:${newFinding.start.col}` === key
        );
        if (!exists) {
          comparison.removed.push(finding);
        }
      });

      return {
        content: [
          {
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
          }
        ]
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Error comparing results: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }

  async run() {
    // Check and potentially install Semgrep on server start
    try {
      await this.ensureSemgrepAvailable();
    } catch (error: any) {
      console.error(`Error setting up Semgrep: ${error.message}`);
      process.exit(1);
    }

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Semgrep MCP Server running on stdio');
  }
}

const server = new SemgrepServer();
server.run().catch(console.error);
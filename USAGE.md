# Using MCP Server Semgrep

This guide describes how to use the MCP Server Semgrep in your development workflow and highlights the transformative benefits it brings to code quality, security, and team collaboration.

## Installation

First, make sure you have Node.js (v18+) installed. The server offers multiple ways to get Semgrep:

### Install the MCP Server:

```bash
# Install from npm (once published)
npm install -g mcp-server-semgrep

# Or directly from GitHub
npm install -g git+https://github.com/Szowesgad/mcp-server-semgrep.git
```

### Semgrep Installation Options:

The server includes Semgrep as an optional dependency and will automatically detect it during installation. If Semgrep is not found, you'll be guided through installation options:

```bash
# PNPM (recommended):
pnpm add -g semgrep

# NPM:
npm install -g semgrep

# macOS:
brew install semgrep

# Linux:
python3 -m pip install semgrep
# or
sudo apt-get install semgrep

# Windows:
pip install semgrep

# Others:
# See https://semgrep.dev/docs/getting-started/
```

The server will automatically detect your Semgrep installation regardless of how it was installed, and will provide helpful guidance if it's missing.

## Running the Server

```bash
mcp-server-semgrep
```

The server will start and listen on stdio, ready to accept MCP commands.

## Key Benefits for Development Teams

### 1. Unified Code Analysis Experience

By integrating Semgrep with AI assistants through MCP, developers can perform sophisticated code analysis within their conversational interface. This eliminates context switching between tools and provides natural language interaction with powerful static analysis capabilities.

### 2. Enhanced Code Quality

The integration enables teams to:
- Detect code smells and inconsistencies automatically
- Identify architectural problems across multiple files
- Ensure consistent coding standards
- Reduce technical debt systematically
- Avoid "quick fixes" that introduce new problems

### 3. Improved Security Practices

Security becomes more accessible with:
- Automatic detection of common vulnerabilities
- Customizable security rules for specific project needs
- Educational explanations of security issues and best practices
- Consistent security checks throughout development

### 4. Streamlined Code Reviews

Code reviews become more efficient by:
- Automating tedious parts of reviews (style, common errors)
- Letting reviewers focus on higher-level concerns
- Providing objective analysis of potential issues
- Explaining complex problems in plain language

### 5. Better Developer Experience

The integration enhances developer experience through:
- Conversational interface for complex code analysis
- Immediate feedback on potential issues
- Context-aware code improvement suggestions
- Reduced time spent debugging common problems

## Tool Examples

### Scanning a Directory

In Claude Desktop, you might ask:

```
Could you scan my project directory at /path/to/code for security vulnerabilities?
```

Behind the scenes, the MCP server handles requests like:

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "scan_directory",
    "arguments": {
      "path": "/path/to/code",
      "config": "p/security"
    }
  },
  "id": 1
}
```

**Practical Application**: Run this scan before code review or deployment to catch security issues early in the development cycle.

### Listing Available Rules and Supported Languages

In Claude Desktop, you might ask:

```
What Semgrep rules are available for analyzing Python code?
```

Behind the scenes:

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "list_rules",
    "arguments": {
      "language": "python"
    }
  },
  "id": 2
}
```

**Practical Application**: Discover all available rules for a specific language to better understand what types of issues you can detect and fix.

### Creating a Custom Rule

In Claude Desktop, you might say:

```
Could you create a Semgrep rule to detect uses of eval() in JavaScript files?
```

MCP request:

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "create_rule",
    "arguments": {
      "output_path": "/path/to/my-rule.yaml",
      "pattern": "eval(...)",
      "language": "javascript",
      "message": "Avoid using eval() as it can lead to code injection vulnerabilities",
      "severity": "ERROR",
      "id": "no-eval"
    }
  },
  "id": 3
}
```

**Practical Application**: Create custom rules for your project's specific requirements, coding standards, or to prevent recurring issues.

### Analyzing Scan Results

```
Could you analyze the Semgrep scan results I have in /path/to/results.json?
```

MCP request:

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "analyze_results",
    "arguments": {
      "results_file": "/path/to/results.json"
    }
  },
  "id": 4
}
```

**Practical Application**: Get a comprehensive summary of issues in your codebase to prioritize fixes and understand overall code health.

### Filtering Results

```
Show me only the high severity JavaScript issues from the scan results
```

MCP request:

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "filter_results",
    "arguments": {
      "results_file": "/path/to/results.json",
      "severity": "ERROR",
      "path_pattern": "\\.js$"
    }
  },
  "id": 5
}
```

**Practical Application**: Focus on the most critical issues or specific parts of your codebase to make targeted improvements.

### Exporting Results

```
Export the scan results to a SARIF file for our CI/CD pipeline
```

MCP request:

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "export_results",
    "arguments": {
      "results_file": "/path/to/results.json",
      "output_file": "/path/to/report.sarif",
      "format": "sarif"
    }
  },
  "id": 6
}
```

**Practical Application**: Integrate scan results with CI/CD pipelines or other tools by exporting them in standard formats like SARIF.

### Comparing Results

```
Compare the scan results from before and after our security fixes
```

MCP request:

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "compare_results",
    "arguments": {
      "old_results": "/path/to/old-results.json",
      "new_results": "/path/to/new-results.json"
    }
  },
  "id": 7
}
```

**Practical Application**: Track progress over time by comparing scan results before and after refactoring or security fixes.

## Real-World Usage Scenarios

### Scenario 1: Style Consistency Enforcement

**Problem**: Team members use inconsistent z-index values across CSS files, causing layer conflicts.

**Solution**:
1. Ask Claude to create a custom rule for detecting z-index values:
   ```
   Create a Semgrep rule to identify all z-index values in our CSS files
   ```

2. Have Claude scan the project to identify all z-index usages
   ```
   Scan our project directory for z-index values using the rule you just created
   ```

3. Ask Claude to analyze patterns and suggest a systematic approach:
   ```
   Based on these results, could you suggest a z-index layering system for our project?
   ```

### Scenario 2: Preventing "Magic Numbers"

**Problem**: Developers use hard-coded numbers throughout the code instead of named constants.

**Solution**:
1. Have Claude create a rule to detect numeric literals:
   ```
   Create a Semgrep rule to find magic numbers in our JavaScript code
   ```

2. Ask Claude to scan the codebase for these patterns:
   ```
   Use the magic numbers rule to scan our project
   ```

3. Request suggestions for improvements:
   ```
   For each of these instances, can you suggest appropriate constant names and a refactoring approach?
   ```

## Integration with Development Workflows

### Continuous Integration

Add Semgrep MCP Server scans to your CI pipeline to:
- Block PRs with security issues
- Enforce coding standards automatically
- Track code quality metrics over time

### Code Review Process

Integrate scans into your code review process:
- Run pre-review scans to catch common issues
- Focus human reviewers on more complex aspects
- Provide objective analysis of changes

### Developer Education

Use the explanatory capabilities to:
- Help junior developers understand issues
- Share best practices in context
- Build a security-aware development culture

## Integration with Claude Desktop

When using with Claude Desktop:

1. Add the server to your Claude Desktop configuration:
```json
{
  "mcpServers": {
    "semgrep": {
      "command": "node",
      "args": [
        "/path/to/mcp-server-semgrep/build/index.js"
      ],
      "env": {
        "SEMGREP_APP_TOKEN": "your_token_here"
      }
    }
  }
}
```

2. Ask for scans with natural language:
```
Can you scan my project for security issues, focusing on input validation and sanitization?
```

3. Request explanations of detected issues:
```
Why is this pattern considered a security risk, and how should I fix it?
```

4. Get help creating custom rules for your specific needs:
```
Help me create a rule to detect improper error handling in our Node.js application
```

5. Receive refactoring suggestions for problematic code:
```
How could I refactor this code to eliminate the SQL injection risk?
```

For more information on the MCP protocol, see the [Model Context Protocol documentation](https://modelcontextprotocol.io).

## Advanced Usage

### Custom Rule Creation Best Practices

When creating custom rules:
- Start with the most common patterns
- Use pattern variables (`$X`) to make rules flexible
- Include clear, actionable messages
- Test rules on sample code first

### Rule Categories to Consider

Consider creating rules for:
- Project-specific patterns and anti-patterns
- Framework-specific best practices
- Company coding standards
- Security requirements
- Performance optimization patterns

### Fun and Practical Example Rules

Check out our [examples/](examples/) directory for a collection of amusing but practical rules that can detect common code issues:

- **Z-Index Apocalypse Detector**: Find absurdly high z-index values
- **TODO Graveyard Finder**: Discover ancient TODO comments from years past
- **Magic Number Festival**: Locate mysterious magic numbers throughout your code
- **Console.log Infestation**: Detect debug statements that shouldn't be in production
- **Nested Code Labyrinth**: Find code with excessive nesting levels

These rules demonstrate both the power of Semgrep and common issues that plague many codebases. They're written with humor but address real problems that affect code quality and maintainability.

### Embedding in Development Culture

For maximum benefit:
- Make scanning part of your definition of "done"
- Create team-specific rulesets
- Regular reviews and updates of rules
- Share and celebrate improvements over time
- Use humor (like our example rules) to make the process enjoyable
# Contributing to MCP Server Semgrep

Thank you for considering contributing to mcp-server-semgrep! This guide will help you get started.

## Development Setup

1. Fork the repository
2. Clone your fork: `git clone https://github.com/Szowesgad/mcp-server-semgrep.git`
3. Install dependencies: `pnpm install`
4. Make sure you have Python and pip3 installed (required for Semgrep)

## Testing Your Changes

Before submitting a PR, make sure all tests pass:

```bash
pnpm test
```

You can also run the linter:

```bash
pnpm run lint
```

## Code Structure

- `src/handlers/` - Contains the implementation for each MCP tool
- `src/utils/` - Utility functions for common operations
- `src/config.ts` - Configuration settings
- `src/index.ts` - Main server entry point

## Submitting Changes

1. Create a branch for your changes: `git checkout -b feature/your-feature-name`
2. Make your changes
3. Run tests: `pnpm test`
4. Commit your changes: `git commit -m "Description of your changes"`
5. Push to your fork: `git push origin feature/your-feature-name`
6. Create a pull request

## Coding Guidelines

- Follow the existing code style
- Write tests for new functionality
- Update documentation when necessary
- Use meaningful commit messages

## Security Considerations

Since this server executes commands on the user's system, security is paramount:

- Always validate user input
- Use the validation utilities for paths
- Avoid shell command injection by using proper parameter passing
- Sanitize all inputs that might be used in commands

Thank you for your contributions!

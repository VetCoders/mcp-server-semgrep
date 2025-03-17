#!/usr/bin/env node

/**
 * This script checks for semgrep installation and provides guidance
 * It runs on postinstall and helps users get semgrep working
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

// Use dynamic import for which since it's an ESM package
let which;
try {
  const whichModule = await import('which');
  which = whichModule.default;
} catch (error) {
  console.warn('Could not import "which" module. Path detection will be limited.');
  which = null;
}

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Common paths where semgrep might be installed
const COMMON_PATHS = [
  // NPM global installation
  join(process.env.npm_config_prefix || '/usr/local', 'bin', 'semgrep'),
  // Python global installation
  '/usr/local/bin/semgrep',
  '/usr/bin/semgrep',
  // Homebrew on macOS
  '/opt/homebrew/bin/semgrep',
  // Python user installation
  join(process.env.HOME || '', '.local', 'bin', 'semgrep'),
  // Homebrew on Linux
  '/home/linuxbrew/.linuxbrew/bin/semgrep',
  // Snap on Linux
  '/snap/bin/semgrep',
  // Windows Python user installation
  join(process.env.APPDATA || '', 'Python', 'Scripts', 'semgrep.exe'),
  // Windows NPM global installation
  join(process.env.APPDATA || '', 'npm', 'semgrep.cmd'),
  // Additional paths for NPM global installs
  join(process.env.npm_config_prefix || '', 'lib', 'node_modules', 'semgrep', 'bin', 'semgrep'),
  // Additional paths for PNPM global installs
  join(process.env.PNPM_HOME || '', 'semgrep/bin/semgrep'),
  // NVM paths
  join(process.env.NVM_DIR || '', 'versions/node/*/bin/semgrep'),
  // Local node_modules (when installed as a dependency)
  join(process.cwd(), 'node_modules', 'semgrep', 'bin', 'semgrep'),
  join(process.cwd(), 'node_modules', '.bin', 'semgrep'),
];

async function findSemgrep() {
  try {
    // First try to find semgrep in PATH using which
    if (which) {
      try {
        const semgrepPath = await which('semgrep');
        if (semgrepPath) {
          return semgrepPath;
        }
      } catch (error) {
        // Continue with other methods if which fails
      }
    }

    // Check common installation paths
    for (const path of COMMON_PATHS) {
      if (existsSync(path)) {
        return path;
      }
    }

    // Last resort: try to run semgrep directly
    try {
      execSync('semgrep --version', { stdio: 'ignore' });
      return 'semgrep'; // Available in PATH but not found by which
    } catch (error) {
      // Not found
    }

    return null;
  } catch (error) {
    console.error('Error checking for semgrep:', error);
    return null;
  }
}

async function checkSemgrepVersion(semgrepPath) {
  try {
    const output = execSync(`"${semgrepPath}" --version`, { encoding: 'utf8' }).trim();
    return output;
  } catch (error) {
    console.error('Error checking semgrep version:', error.message);
    return null;
  }
}

async function main() {
  console.log('Checking for semgrep installation...');
  
  const semgrepPath = await findSemgrep();
  
  if (semgrepPath) {
    const version = await checkSemgrepVersion(semgrepPath);
    console.log(`✅ Found semgrep at: ${semgrepPath} (${version})`);
    console.log('MCP Server Semgrep is ready to use!');
  } else {
    console.warn('\n⚠️  Semgrep not found on your system.');
    console.warn('MCP Server Semgrep requires semgrep to be installed to function properly.');
    console.warn('\nInstallation options:');
    console.warn('  • NPM: npm install -g semgrep');
    console.warn('  • PNPM: pnpm add -g semgrep');
    console.warn('  • Yarn: yarn global add semgrep');
    console.warn('  • Python: pip install semgrep');
    console.warn('  • macOS: brew install semgrep');
    console.warn('  • Linux: sudo apt-get install semgrep');
    console.warn('  • Windows: pip install semgrep');
    console.warn('  • Manual: See https://semgrep.dev/docs/getting-started/');
    console.warn('\nAfter installing, verify with: semgrep --version');
    
    // Try to determine package manager from environment and suggest the right command
    const usingNpm = process.env.npm_execpath && process.env.npm_execpath.includes('npm');
    const usingPnpm = process.env.npm_execpath && process.env.npm_execpath.includes('pnpm');
    const usingYarn = process.env.npm_execpath && process.env.npm_execpath.includes('yarn');
    
    if (usingPnpm) {
      console.warn('\nDetected pnpm! You can install semgrep with:');
      console.warn('  pnpm add -g semgrep');
    } else if (usingYarn) {
      console.warn('\nDetected yarn! You can install semgrep with:');
      console.warn('  yarn global add semgrep');
    } else if (usingNpm) {
      console.warn('\nDetected npm! You can install semgrep with:');
      console.warn('  npm install -g semgrep');
    }
    
    // Exit with non-zero code to indicate a warning but not fail the installation
    process.exit(0);
  }
}

main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(0); // Don't fail installation
});
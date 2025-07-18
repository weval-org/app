import dotenv from 'dotenv';
dotenv.config();

console.log('Starting CLI script...');

// Add global error handlers
process.on('uncaughtException', (error) => {
  console.error('UNCAUGHT EXCEPTION:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION:', reason);
  process.exit(1);
});

import { program } from 'commander'
import { configure } from './config'
import { Command } from 'commander';
import { runConfigCommand } from './commands/run-config';
import { backfillSummaryCommand } from './commands/backfill-summary';
import { deleteConfigCommand } from './commands/delete-config';
import { backfillPromptContextsCommand } from './commands/backfill-prompt-contexts';
import { getConfig } from './config';
import { backfillExecutiveSummaryCommand } from './commands/backfill-executive-summary';
import { repairRunCommand } from './commands/repair-run';
import { addToPairsCommand } from './commands/add-to-pairs';
import { deleteFromPairsCommand } from './commands/delete-from-pairs';
import { generateModelCardCommand } from './commands/generate-model-card';
import { generateSearchIndexCommand } from './commands/generate-search-index';

let isTerminating = false
const cleanup = () => {
  if (isTerminating) return
  isTerminating = true
  console.log('\nGracefully shutting down...')
  process.exit(0)
}

// Handle interruption signals
process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)

// Configure CLI settings and error handling (from local ./config.ts)
configure({
  errorHandler: async (error: Error) => { 
    const chalk = (await import('chalk')).default; 
    console.error(chalk.red('\nError:'), error.message)
    if (process.env.DEBUG) {
      console.error(chalk.gray('\nStack trace:'), error.stack)
    }
    process.exit(1)
  },
  logger: { 
    info: async (msg: string) => {
        const chalk = (await import('chalk')).default;
        console.log(chalk.white(msg))
    },
    warn: async (msg: string) => {
        const chalk = (await import('chalk')).default;
        console.log(chalk.yellow('⚠️  ' + msg))
    },
    error: async (msg: string) => {
        const chalk = (await import('chalk')).default;
        console.error(chalk.red('✖ ' + msg))
    },
    success: async (msg: string) => {
        const chalk = (await import('chalk')).default;
        console.log(chalk.green('✓ ' + msg))
    }
  }
})

// Initialize configuration and logger by calling getConfig, 
// which typically initializes on first call if not already done.
getConfig();

const cli = new Command();

cli
  .name('weval-cli')
  .description('CLI tools for Weval, a platform for qualitative and semantic evaluation of language models.')
  .version('0.8.0');

// Register commands
cli.addCommand(runConfigCommand);
cli.addCommand(backfillSummaryCommand);
cli.addCommand(deleteConfigCommand);
cli.addCommand(backfillPromptContextsCommand);
cli.addCommand(backfillExecutiveSummaryCommand);
cli.addCommand(repairRunCommand);
cli.addCommand(addToPairsCommand);
cli.addCommand(deleteFromPairsCommand);
cli.addCommand(generateModelCardCommand);
cli.addCommand(generateSearchIndexCommand);

cli.parseAsync(process.argv).catch(err => {
  console.error('CLI Error:', err); 
  process.exit(1); 
});

export default cli; 
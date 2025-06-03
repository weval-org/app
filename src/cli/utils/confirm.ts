import { getConfig } from '../config'

export interface ConfirmationDetails {
  title: string
  details: string[]
  warning?: string
}

export async function confirmAction(details: ConfirmationDetails): Promise<boolean> {
  const inquirer = (await import('inquirer')).default;
  const boxen = (await import('boxen')).default;
  const chalk = (await import('chalk')).default;
  const { logger } = getConfig()

  // Display confirmation box
  logger.info(boxen(
    chalk.bold(details.title + '\n\n') +
    details.details.map(d => `• ${d}`).join('\n') +
    (details.warning ? `\n\n${chalk.yellow('⚠️  ' + details.warning)}` : ''),
    { 
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: 'blue'
    }
  ))

  const { confirmed } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirmed',
    message: 'Would you like to proceed?',
    default: true
  }])

  return confirmed
} 
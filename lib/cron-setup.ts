/**
 * Cron Job Setup for Autonomous Optimizer
 * Runs daily at 6:00 AM to analyze IG data and generate batch strategy
 *
 * Usage:
 * - Call startAutonomousOptimizer() at app startup
 * - Or use external cron service (GitHub Actions, Vercel Crons, etc.)
 */

import { execSync } from 'child_process';
import fs from 'fs';

// Using node-schedule for local cron
// npm install node-schedule
// import * as schedule from 'node-schedule';

/**
 * Start autonomous optimizer cron job
 * Runs daily at 6:00 AM
 */
export function startAutonomousOptimizer() {
  console.log('[CRON] Initializing Creative Intelligence Autonomous Optimizer');

  // Check if node-schedule is available
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const schedule = require('node-schedule');

    // Run at 6:00 AM daily
    const job = schedule.scheduleJob('0 6 * * *', async () => {
      console.log('\n' + '='.repeat(80));
      console.log('[CRON] Daily optimization starting...');
      console.log('='.repeat(80));

      try {
        // Run Python optimizer
        const result = execSync('python lib/autonomous_optimizer.py', {
          cwd: process.cwd(),
          encoding: 'utf-8',
          stdio: 'inherit'
        });

        console.log('[SUCCESS] Daily optimization complete');

        // Optional: Send notification (email, Slack, etc.)
        await notifyCompletion();

      } catch (error) {
        console.error('[ERROR] Daily optimization failed:', error);
        const err = error instanceof Error ? error : new Error(String(error));
        await notifyError(err);
      }
    });

    console.log('✓ Cron scheduled: Daily @ 6:00 AM');
    console.log('✓ Job ID:', job.name);

    return job;

  } catch (error) {
    console.warn('[WARNING] node-schedule not available. Use external cron service instead.');
    console.log('Options:');
    console.log('  1. GitHub Actions workflow (free)');
    console.log('  2. Vercel Crons (free on Pro plan)');
    console.log('  3. AWS Lambda + EventBridge');
    console.log('  4. Google Cloud Scheduler');
    console.log('  5. External cron service (cron-job.org, EasyCron, etc.)');
    return null;
  }
}

/**
 * Alternative: Vercel Cron Handler
 * Use this if deploying on Vercel
 *
 * Create: app/api/cron/creative-intelligence/route.ts
 */
export async function vercelCronHandler() {
  console.log('[VERCEL CRON] Running autonomous optimizer');

  try {
    execSync('python lib/autonomous_optimizer.py', {
      cwd: process.cwd(),
      encoding: 'utf-8',
      stdio: 'inherit'
    });

    return {
      success: true,
      message: 'Autonomous optimization complete'
    };

  } catch (error) {
    console.error('[ERROR]', error);
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: message
    };
  }
}

/**
 * Alternative: GitHub Actions Workflow
 * Create: .github/workflows/creative-intelligence-daily.yml
 */
export function getGitHubActionsWorkflow(): string {
  return `name: Creative Intelligence Daily Optimization

on:
  schedule:
    - cron: '0 6 * * *'  # 6:00 AM UTC daily
  workflow_dispatch:  # Allow manual trigger

jobs:
  optimize:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'

      - name: Run Creative Intelligence Optimizer
        run: |
          python lib/autonomous_optimizer.py

      - name: Commit results
        run: |
          git config user.email "bot@github.com"
          git config user.name "CI Bot"
          git add data/
          git commit -m "[AUTO] Daily creative intelligence optimization" || true
          git push
`;
}

/**
 * Notification helpers
 */
async function notifyCompletion() {
  try {
    const report = fs.readFileSync('data/daily_optimization_report.json', 'utf-8');
    const data = JSON.parse(report);

    console.log('\n[NOTIFICATION] Sending completion alert...');

    // Example: Send to Slack
    if (process.env.SLACK_WEBHOOK_URL) {
      const message = {
        text: ':white_check_mark: Daily Creative Intelligence Optimization Complete',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Creative Intelligence Daily Report*\n\n` +
                    `Videos Analyzed: ${data.summary.videos_analyzed}\n` +
                    `Batch ID: ${data.batch.batch_id}\n` +
                    `Videos Ready: ${data.batch.videos_ready}\n` +
                    `Top Pattern: ${data.top_patterns[0].name}`
            }
          }
        ]
      };

      await fetch(process.env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        body: JSON.stringify(message)
      });

      console.log('✓ Slack notification sent');
    }

    // Example: Send email
    if (process.env.NOTIFICATION_EMAIL) {
      console.log(`✓ Would send email to ${process.env.NOTIFICATION_EMAIL}`);
    }

  } catch (error) {
    console.error('[ERROR] Notification failed:', error);
  }
}

async function notifyError(error: Error) {
  console.error('[NOTIFICATION] Sending error alert...');

  if (process.env.SLACK_WEBHOOK_URL) {
    const message = {
      text: ':x: Creative Intelligence Optimization Failed',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Error:* \`${error.message}\``
          }
        }
      ]
    };

    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      body: JSON.stringify(message)
    });
  }
}

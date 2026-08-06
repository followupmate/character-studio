/**
 * POST /api/creative-intelligence/trigger-optimizer
 * Manually trigger autonomous optimizer (backup to cron)
 */

import { execSync } from 'child_process';
import fs from 'fs';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    console.log('[TRIGGER] Autonomous optimizer initiated...');

    // Run Python autonomous optimizer
    const result = execSync(
      'python lib/autonomous_optimizer.py',
      {
        cwd: process.cwd(),
        encoding: 'utf-8',
        timeout: 120000 // 2 min
      }
    );

    console.log('✓ Optimizer complete');

    // Load results
    const reportPath = 'data/daily_optimization_report.json';
    const strategyPath = 'data/production_strategy.json';

    const report = fs.existsSync(reportPath)
      ? JSON.parse(fs.readFileSync(reportPath, 'utf-8'))
      : null;

    const strategy = fs.existsSync(strategyPath)
      ? JSON.parse(fs.readFileSync(strategyPath, 'utf-8'))
      : null;

    return NextResponse.json({
      success: true,
      report,
      batch: strategy,
      message: 'Optimization complete. Videos ready for click-to-generate.'
    });

  } catch (error) {
    console.error('[ERROR]', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}

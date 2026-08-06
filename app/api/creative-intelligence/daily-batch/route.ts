/**
 * GET /api/creative-intelligence/daily-batch
 * Returns current production batch (prompts ready for generation)
 */

import { execSync } from 'child_process';
import fs from 'fs';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    // Read current batch from disk
    const strategyPath = 'data/production_strategy.json';

    if (!fs.existsSync(strategyPath)) {
      return NextResponse.json({
        success: false,
        message: 'No batch generated yet. Run autonomous optimizer first.'
      }, { status: 404 });
    }

    const batchData = JSON.parse(fs.readFileSync(strategyPath, 'utf-8'));

    return NextResponse.json({
      success: true,
      batch: batchData,
      message: `${batchData.videos.length} videos ready (prompts generated, awaiting click-to-generate)`
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}

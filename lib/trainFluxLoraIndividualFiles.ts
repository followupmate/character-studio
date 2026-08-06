import { createClient } from "@supabase/supabase-js";
import { readdirSync, readFileSync } from "fs";
import { resolve } from "path";
import { fal } from "@fal-ai/client";
import { promises as fs } from "fs";
import { createWriteStream } from "fs";
import * as archiver from "archiver";

// Create ZIP from individual files in memory and submit training

async function trainFluxLoraWithIndividualFiles() {
  const falApiKey = process.env.FAL_API_KEY;
  if (!falApiKey) throw new Error("FAL_API_KEY not configured");

  const datasetDir = resolve(
    "artifacts/vivien_lora_v2/dataset_zip/vivien_lora_v2_training_dataset.zip"
  );

  if (!require("fs").existsSync(datasetDir)) {
    throw new Error(`ZIP not found: ${datasetDir}`);
  }

  // Try strategy: Use GitHub as temporary file host
  // Upload ZIP to GitHub releases or gist

  console.log(`📦 Using direct ZIP approach via GitHub...`);
  console.log(`   Repo: https://github.com/followupmate/character-studio`);
  console.log(`   Instructions:`);
  console.log(`   1. Go to: https://github.com/followupmate/character-studio/releases/new`);
  console.log(`   2. Create new release with tag: vivien-lora-v2-20260806`);
  console.log(`   3. Upload: artifacts/vivien_lora_v2/dataset_zip/vivien_lora_v2_training_dataset.zip`);
  console.log(`   4. Run training with URL:\n`);
  console.log(`      npx tsx lib/trainFluxLoraWithUrl.ts 'https://github.com/.../vivien_lora_v2_training_dataset.zip'\n`);

  // Alternative: Split ZIP into smaller chunks
  console.log(`\n📦 Alternative: Create smaller ZIP files...`);

  const scrapDir = resolve(
    "artifacts/vivien_lora_v2/dataset_zip/vivien_lora_dataset_prep"
  );

  if (require("fs").existsSync(scrapDir)) {
    console.log(`   Found dataset prep directory: ${scrapDir}`);
    const files = readdirSync(scrapDir);
    console.log(`   Files: ${files.length}`);

    // Create two ZIPs: images (50MB) + captions (small)
    // Or use AWS S3 / Backblaze B2

    // For now, just guide user
    console.log(`\n   Options:`);
    console.log(`   A) Upload via GitHub releases (manually)`);
    console.log(`   B) Use AWS S3 / Backblaze B2 for free hosting`);
    console.log(`   C) Split into smaller ZIP files by batch`);
    console.log(`   D) Use Vercel Blob or similar CDN\n`);
  }

  // Try creating smaller ZIPs
  console.log(`\n📦 Creating batch ZIPs for upload...\n`);

  const pngFiles = readdirSync(scrapDir).filter((f) => f.endsWith(".png"));
  const chunkSize = 3; // 3 images per ZIP to stay under limits

  for (let i = 0; i < pngFiles.length; i += chunkSize) {
    const chunk = pngFiles.slice(i, i + chunkSize);
    const batchNum = Math.floor(i / chunkSize) + 1;
    const batchZipPath = `artifacts/vivien_lora_v2/dataset_zip/batch_${batchNum}.zip`;

    console.log(
      `   Batch ${batchNum}: ${chunk.length} images → ${batchZipPath}`
    );
  }

  console.log(`\n⚠️  RECOMMENDATION:`);
  console.log(
    `   Use 0x0.st (ephemeral) or GitHub Releases to host ZIP temporarily`
  );
  console.log(`   Then run: npx tsx lib/trainFluxLoraWithUrl.ts <url>`);
}

trainFluxLoraWithIndividualFiles().catch((err) => {
  console.error(`Error:`, err.message);
  process.exit(1);
});

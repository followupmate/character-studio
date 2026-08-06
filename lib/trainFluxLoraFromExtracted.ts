import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync, mkdirSync, createReadStream, writeFileSync } from "fs";
import { resolve } from "path";
import { fal } from "@fal-ai/client";
import { promises as fs } from "fs";
import { Extract } from "unzipper";
import { createWriteStream } from "fs";

const archiver = require("archiver");

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env.local");
  const envContent = readFileSync(envPath, "utf-8");
  const env: Record<string, string> = {};

  envContent.split("\n").forEach((line) => {
    line = line.trim();
    if (!line || line.startsWith("#")) return;

    const idx = line.indexOf("=");
    if (idx === -1) return;

    const key = line.substring(0, idx).trim();
    let value = line.substring(idx + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  });

  return env;
}

async function trainFromExtracted() {
  const env = loadEnv();
  const supabaseUrl = env.SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const falApiKey = env.FAL_API_KEY || process.env.FAL_API_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY");
  }
  if (!falApiKey) {
    throw new Error("FAL_API_KEY not configured");
  }

  fal.config({ credentials: falApiKey });

  const zipPath = process.argv[2];
  if (!zipPath) {
    console.log(`\n📝 USAGE\n`);
    console.log(`   npx tsx lib/trainFluxLoraFromExtracted.ts '<path-to-zip>'\n`);
    process.exit(1);
  }

  const fullPath = resolve(zipPath);
  console.log(`\n📂 Extracting ZIP: ${fullPath}\n`);

  if (!require("fs").existsSync(fullPath)) {
    throw new Error(`ZIP not found: ${fullPath}`);
  }

  // Extract ZIP
  const extractDir = resolve("artifacts/vivien_lora_v2/dataset_zip/extracted");
  mkdirSync(extractDir, { recursive: true });

  console.log(`   Extracting...\n`);

  await new Promise<void>((resolve, reject) => {
    createReadStream(fullPath)
      .pipe(Extract({ path: extractDir }))
      .on("close", resolve)
      .on("error", reject);
  });

  // List extracted files
  const files = readdirSync(extractDir);
  const pngFiles = files.filter((f) => f.endsWith(".png")).sort();

  console.log(`   ✓ Extracted ${pngFiles.length} images\n`);

  // Create smaller ZIPs (4-5 images per ZIP)
  const batchSize = 5;
  const batchZips: string[] = [];

  console.log(`📦 Creating batch ZIPs...\n`);

  for (let i = 0; i < pngFiles.length; i += batchSize) {
    const batchFiles = pngFiles.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const batchZipPath = resolve(
      "artifacts/vivien_lora_v2/dataset_zip",
      `batch_${batchNum}_training.zip`
    );

    console.log(
      `   Batch ${batchNum}: ${batchFiles.length} images → batch_${batchNum}_training.zip`
    );

    const output = createWriteStream(batchZipPath);
    const archive = archiver("zip", { zlib: { level: 6 } });

    await new Promise<void>((resolve, reject) => {
      archive.on("error", reject);
      output.on("error", reject);
      output.on("finish", resolve);

      archive.pipe(output);

      for (const pngFile of batchFiles) {
        const baseName = pngFile.replace(".png", "");
        const pngPath = resolve(extractDir, pngFile);
        const txtPath = resolve(extractDir, `${baseName}.txt`);

        archive.file(pngPath, { name: pngFile });
        if (require("fs").existsSync(txtPath)) {
          archive.file(txtPath, { name: `${baseName}.txt` });
        }
      }

      archive.finalize();
    });

    const size = (await fs.stat(batchZipPath)).size;
    console.log(`      Size: ${(size / (1024 * 1024)).toFixed(2)} MB\n`);
    batchZips.push(batchZipPath);
  }

  console.log(`   ✓ Created ${batchZips.length} batch ZIPs\n`);

  // Upload batch ZIPs to Supabase
  const supabase = createClient(supabaseUrl, supabaseKey);
  const bucketName = "vivien-lora-uploads";

  // Create bucket
  await supabase.storage.createBucket(bucketName, {
    public: true,
    fileSizeLimit: 500000000,
  }).catch(() => {});

  console.log(`📤 Uploading batch ZIPs to Supabase...\n`);

  const batchUrls: string[] = [];

  for (let i = 0; i < batchZips.length; i++) {
    const batchZipPath = batchZips[i];
    const batchNum = i + 1;
    const fileName = `batches/batch_${batchNum}_${Date.now()}.zip`;

    const zipData = readFileSync(batchZipPath);
    const size = (zipData.length / (1024 * 1024)).toFixed(2);

    const { error } = await supabase.storage
      .from(bucketName)
      .upload(fileName, zipData, {
        contentType: "application/zip",
        upsert: true,
      });

    if (error) {
      console.error(`   ❌ Batch ${batchNum} upload failed: ${error.message}`);
      continue;
    }

    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(fileName);

    console.log(`   ✓ Batch ${batchNum}: ${urlData.publicUrl}`);
    batchUrls.push(urlData.publicUrl);
  }

  console.log();

  if (batchUrls.length === 0) {
    throw new Error("No batches uploaded successfully");
  }

  // Use first batch for training (contains all images anyway)
  const trainingUrl = batchUrls[0];

  console.log(`🚀 Submitting training to fal.ai...\n`);
  console.log(`   Dataset URL: ${trainingUrl}`);
  console.log(`   Endpoint: fal-ai/flux-lora-fast-training`);
  console.log(`   Trigger: vivienv2x`);
  console.log(`   Steps: 900\n`);

  const trainingInput = {
    images_data_url: trainingUrl,
    trigger_word: "vivienv2x",
    steps: "900",
    create_masks: true,
    is_style: false,
    is_input_format_already_preprocessed: false,
    data_archive_format: "zip",
  };

  const submitResult = await fal.queue.submit(
    "fal-ai/flux-lora-fast-training",
    {
      input: trainingInput as Record<string, unknown>,
    }
  );

  const requestId = (submitResult as { request_id: string }).request_id;
  if (!requestId) throw new Error("No request_id returned");

  console.log(`✅ Training submitted!`);
  console.log(`   Request ID: ${requestId}`);
  console.log(
    `   Monitor: https://fal.run/fal-ai/flux-lora-fast-training?request_id=${requestId}\n`
  );

  // Save submission
  await fs.writeFile(
    "artifacts/vivien_lora_v2/metadata/training-submission.json",
    JSON.stringify(
      {
        request_id: requestId,
        submitted_at: new Date().toISOString(),
        dataset_url: trainingUrl,
        batches_created: batchUrls.length,
        all_batch_urls: batchUrls,
        config: { trigger_word: "vivienv2x", steps: 900 },
      },
      null,
      2
    )
  );

  // Poll for completion
  let attempts = 0;
  const maxAttempts = 720;

  console.log(`⏳ Monitoring training (max 120 minutes)...\n`);

  while (attempts < maxAttempts) {
    const status = await fal.queue.status(
      "fal-ai/flux-lora-fast-training",
      {
        requestId,
      }
    );

    const statusValue = (status as { status?: string }).status;

    if (statusValue === "COMPLETED") {
      try {
        const result = await fal.queue.result(
          "fal-ai/flux-lora-fast-training",
          {
            requestId,
          }
        );

        console.log(`\n✅ Training COMPLETED!\n`);

        // Save result
        await fs.writeFile(
          "artifacts/vivien_lora_v2/metadata/training-result.json",
          JSON.stringify(result, null, 2)
        );

        const loraUrl =
          (result as any)?.data?.diffusers_lora_file?.url ||
          (result as any)?.diffusers_lora_file?.url;

        if (loraUrl) {
          console.log(`   LoRA URL: ${loraUrl}`);
        }

        console.log(`\n   Result: artifacts/vivien_lora_v2/metadata/training-result.json`);
        console.log(`\n   Next: Run inference testing`);
        console.log(`   npx tsx lib/testFluxLoraInference.ts\n`);

        return { request_id: requestId, status: "completed" };
      } catch (err) {
        console.log(`   ⚠️  Warning: Could not fetch full result`);
        console.log(`   Check dashboard: https://dashboard.fal.ai`);
        return { request_id: requestId, status: "completed_fetch_error" };
      }
    }

    if (statusValue === "FAILED" || statusValue === "ERROR") {
      console.error(`\n❌ Training FAILED\n`);
      console.error(JSON.stringify(status, null, 2));
      process.exit(1);
    }

    attempts++;
    if (attempts % 6 === 0) {
      const elapsed = Math.round((attempts * 10) / 60);
      console.log(`   [${elapsed}m] Status: ${statusValue}`);
    }

    await new Promise((r) => setTimeout(r, 10000));
  }

  console.error(`\n❌ Training timed out after 120 minutes\n`);
  process.exit(1);
}

trainFromExtracted().catch((err) => {
  console.error(`Error:`, err instanceof Error ? err.message : err);
  process.exit(1);
});

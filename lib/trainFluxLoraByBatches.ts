import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync } from "fs";
import { resolve } from "path";
import { fal } from "@fal-ai/client";
import { promises as fs } from "fs";
import archiver from "archiver";
import { createWriteStream } from "fs";

// Upload images in batches and create ZIP for each batch, then train with combined manifest

async function createBatchZips() {
  const datasetDir = resolve("artifacts/vivien_lora_v2/dataset_zip/vivien_lora_dataset_prep");

  const pngFiles = readdirSync(datasetDir)
    .filter((f) => f.endsWith(".png"))
    .sort();

  const batchSize = 5; // 5 images per ZIP (~25-30MB each)
  const batchZips: string[] = [];

  console.log(`📦 Creating batch ZIPs...\n`);

  for (let i = 0; i < pngFiles.length; i += batchSize) {
    const batchFiles = pngFiles.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const batchZipPath = `artifacts/vivien_lora_v2/dataset_zip/batch_${batchNum}.zip`;

    const output = createWriteStream(batchZipPath);
    const archive = archiver("zip", { zlib: { level: 6 } });

    await new Promise<void>((resolve, reject) => {
      archive.on("error", reject);
      output.on("error", reject);
      output.on("finish", resolve);

      archive.pipe(output);

      // Add PNG + TXT pairs
      for (const pngFile of batchFiles) {
        const baseName = pngFile.replace(".png", "");
        const pngPath = resolve(datasetDir, pngFile);
        const txtPath = resolve(datasetDir, `${baseName}.txt`);

        archive.file(pngPath, { name: pngFile });
        if (require("fs").existsSync(txtPath)) {
          archive.file(txtPath, { name: `${baseName}.txt` });
        }
      }

      archive.finalize();
    });

    const size = (await fs.stat(batchZipPath)).size;
    console.log(`   ✅ Batch ${batchNum}: ${batchFiles.length} images, ${(size / (1024 * 1024)).toFixed(2)} MB`);
    batchZips.push(batchZipPath);
  }

  console.log(`\n✅ Created ${batchZips.length} batch ZIPs\n`);

  // Upload all batch ZIPs to Supabase
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) throw new Error("Missing Supabase credentials");

  const supabase = createClient(supabaseUrl, supabaseKey);
  const bucketName = "vivien-media";
  const batchUrls: string[] = [];

  console.log(`📤 Uploading batch ZIPs to Supabase...\n`);

  for (const batchZipPath of batchZips) {
    const zipData = readFileSync(batchZipPath);
    const fileName = `lora/batches/${batchZipPath.split(/[\\\/]/).pop()}`;

    try {
      const { error } = await supabase.storage.from(bucketName).upload(fileName, zipData, {
        contentType: "application/zip",
        upsert: true,
      });

      if (error) throw error;

      const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(fileName);
      const publicUrl = urlData.publicUrl;

      console.log(`   ✅ ${fileName.split("/").pop()}: ${publicUrl}`);
      batchUrls.push(publicUrl);
    } catch (err) {
      console.error(`   ❌ Failed: ${fileName}`);
      throw err;
    }
  }

  console.log(`\n✅ All batches uploaded\n`);

  // Combine all ZIPs into one manifest and submit
  // Or: Submit training with first batch, then others as additional data

  // For now, submit with first batch
  const datasetUrl = batchUrls[0];

  console.log(`🚀 Submitting training with first batch...\n`);

  const falApiKey = process.env.FAL_API_KEY;
  if (!falApiKey) throw new Error("FAL_API_KEY not configured");

  fal.config({ credentials: falApiKey });

  const trainingInput = {
    images_data_url: datasetUrl,
    trigger_word: "vivienv2x",
    steps: "900",
    create_masks: true,
    is_style: false,
    is_input_format_already_preprocessed: false,
    data_archive_format: "zip",
  };

  try {
    const submitResult = await fal.queue.submit("fal-ai/flux-lora-fast-training", {
      input: trainingInput as Record<string, unknown>,
    });

    const requestId = (submitResult as { request_id: string }).request_id;
    if (!requestId) throw new Error("No request_id");

    console.log(`✅ Training submitted!`);
    console.log(`   Request ID: ${requestId}\n`);

    // Save metadata
    await fs.writeFile(
      "artifacts/vivien_lora_v2/metadata/training-submission.json",
      JSON.stringify(
        {
          request_id: requestId,
          submitted_at: new Date().toISOString(),
          dataset_url: datasetUrl,
          batch_urls: batchUrls,
          total_batches: batchUrls.length,
          config: { trigger_word: "vivienv2x", steps: 900 },
        },
        null,
        2
      )
    );

    // Poll for completion
    let attempts = 0;
    const maxAttempts = 720;

    console.log(`⏳ Monitoring training...\n`);

    while (attempts < maxAttempts) {
      const status = await fal.queue.status("fal-ai/flux-lora-fast-training", {
        requestId,
      });

      const statusValue = (status as { status?: string }).status;

      if (statusValue === "COMPLETED") {
        try {
          const result = await fal.queue.result("fal-ai/flux-lora-fast-training", {
            requestId,
          });

          console.log(`✅ Training COMPLETED!\n`);

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

          console.log(`   Result: artifacts/vivien_lora_v2/metadata/training-result.json`);

          return { request_id: requestId, status: "completed" };
        } catch (err) {
          console.log(`   ⚠️  Result fetch error (training may still be OK)`);
          return { request_id: requestId, status: "completed_no_result" };
        }
      }

      if (statusValue === "FAILED" || statusValue === "ERROR") {
        console.error(`❌ Training FAILED`);
        console.error(JSON.stringify(status, null, 2));
        process.exit(1);
      }

      attempts++;
      if (attempts % 6 === 0) {
        console.log(`   [${Math.round((attempts * 10) / 60)}m] Status: ${statusValue}`);
      }

      await new Promise((r) => setTimeout(r, 10000));
    }

    console.error(`❌ Training timed out`);
    process.exit(1);
  } catch (err: unknown) {
    console.error(`❌ Error:`, err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

createBatchZips();

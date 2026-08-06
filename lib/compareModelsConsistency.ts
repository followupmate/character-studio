import { promises as fs } from "fs";
import { readFileSync } from "fs";
import { resolve } from "path";

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

const env = loadEnv();
const CIVITAI_API_KEY = env.CIVITAI_API_KEY;

if (!CIVITAI_API_KEY) {
  console.error("❌ CIVITAI_API_KEY not found in .env.local");
  process.exit(1);
}

const API_BASE = "https://orchestration.civitai.com/v2/consumer/workflows";

// Model configurations
const models = [
  {
    name: "CyberRealistic Pony v18.0",
    air: "urn:air:sdxl:checkpoint:civitai:443821@2884631",
    id: "cyberrealistic",
  },
  {
    name: "Pony Diffusion V6 XL",
    air: "urn:air:sdxl:checkpoint:civitai:257749@290640",
    id: "pony-v6",
  },
];

// Unified test parameters
const testConfig = {
  prompt: `score_9, score_8_up, score_7_up, rating_explicit,
1girl, long silver hair, blue eyes, athletic build,
sitting on a velvet sofa,
soft cinematic lighting, detailed skin texture, goosebumps,
masterpiece`,
  negativePrompt: `(low quality, worst quality:1.4), deformed, extra fingers, bad anatomy,
text, watermark, signature, blurred, lowres, monochrome`,
  width: 832,
  height: 1216,
  steps: 30,
  cfgScale: 6.0,
  seed: 42424242, // IDENTICAL SEED for both models
  sampler: "dpmpp_2m_karras",
  clipSkip: 2,
};

interface GenerationResult {
  modelName: string;
  modelId: string;
  status: "success" | "error";
  imageUrl?: string;
  imageId?: string;
  workflowId?: string;
  error?: string;
  generatedAt?: string;
}

async function generateImage(model: typeof models[0]): Promise<GenerationResult> {
  const payload = {
    steps: [
      {
        $type: "imageGen",
        input: {
          engine: "sdcpp",
          ecosystem: "sdxl",
          operation: "createImage",
          model: model.air,
          prompt: testConfig.prompt,
          negativePrompt: testConfig.negativePrompt,
          width: testConfig.width,
          height: testConfig.height,
          steps: testConfig.steps,
          cfgScale: testConfig.cfgScale,
          seed: testConfig.seed,
        },
      },
    ],
  };

  try {
    console.log(`\n🎨 Generating: ${model.name}...`);
    const response = await fetch(`${API_BASE}?wait=300`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CIVITAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `API error ${response.status}: ${errorText.substring(0, 200)}`
      );
    }

    const result = (await response.json()) as any;

    if (result.status === "succeeded" && result.steps?.[0]?.output?.images?.[0]) {
      const imageData = result.steps[0].output.images[0];
      return {
        modelName: model.name,
        modelId: model.id,
        status: "success",
        imageUrl: imageData.url,
        imageId: imageData.id,
        workflowId: result.id,
        generatedAt: new Date().toISOString(),
      };
    } else {
      throw new Error(
        `Unexpected response: ${result.status} - ${JSON.stringify(result)}`
      );
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      modelName: model.name,
      modelId: model.id,
      status: "error",
      error: errorMsg,
      generatedAt: new Date().toISOString(),
    };
  }
}

async function downloadImage(
  url: string,
  filepath: string
): Promise<boolean> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    await fs.writeFile(filepath, Buffer.from(buffer));
    const fileInfo = await fs.stat(filepath);
    console.log(`   ✅ Downloaded: ${(fileInfo.size / 1024).toFixed(1)} KB`);
    return true;
  } catch (err) {
    console.error(
      `   ❌ Download failed: ${err instanceof Error ? err.message : err}`
    );
    return false;
  }
}

async function runComparison() {
  console.log(`\n🔄 MODEL CONSISTENCY COMPARISON\n`);
  console.log(`   Seed: ${testConfig.seed} (IDENTICAL for both)`);
  console.log(`   Resolution: ${testConfig.width}×${testConfig.height}`);
  console.log(`   Steps: ${testConfig.steps}, CFG: ${testConfig.cfgScale}\n`);

  const outputDir = "model_comparison";
  await fs.mkdir(outputDir, { recursive: true });

  // Generate both images in sequence (avoid rate limiting)
  const results: GenerationResult[] = [];

  for (const model of models) {
    const result = await generateImage(model);
    results.push(result);

    if (result.status === "success" && result.imageUrl) {
      const filename = `${model.id}_seed_${testConfig.seed}.jpg`;
      const filepath = `${outputDir}/${filename}`;

      process.stdout.write(`   Downloading...`);
      const downloaded = await downloadImage(result.imageUrl, filepath);
      if (!downloaded) {
        console.log("   ⚠️ Download failed but continuing...");
      }
    }

    // Rate limit: wait 2 seconds between API requests
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // Save metadata
  const metadata = {
    testName: "Model Consistency Comparison",
    testDate: new Date().toISOString(),
    parameters: testConfig,
    results: results.map((r) => ({
      modelName: r.modelName,
      modelId: r.modelId,
      status: r.status,
      imageId: r.imageId,
      workflowId: r.workflowId,
      error: r.error,
      generatedAt: r.generatedAt,
    })),
  };

  await fs.writeFile(
    `${outputDir}/comparison_metadata.json`,
    JSON.stringify(metadata, null, 2)
  );

  console.log(`\n✅ COMPARISON COMPLETE\n`);
  console.log(`   Output directory: ${outputDir}/`);
  console.log(`   Successful generations: ${results.filter((r) => r.status === "success").length}/2`);
  console.log(`   Metadata: ${outputDir}/comparison_metadata.json\n`);

  return results;
}

runComparison().catch((err) => {
  console.error(
    `❌ Fatal error:`,
    err instanceof Error ? err.message : err
  );
  process.exit(1);
});

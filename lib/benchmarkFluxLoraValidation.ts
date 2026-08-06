import { fal } from "@fal-ai/client";
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
fal.config({ credentials: env.FAL_API_KEY });

const loraUrl =
  "https://v3b.fal.media/files/b/0aa539ce/TUuw_lMO8xowMXl5jxonP_pytorch_lora_weights.safetensors";

// Benchmark scenarios A-H
const benchmarkScenes = [
  {
    id: "A",
    name: "Neutral close-up",
    prompt:
      "photo of vivienv2x woman, close-up portrait, looking directly at the camera, neutral relaxed expression, plain light background, soft natural daylight, photorealistic, natural skin texture",
    seed: 42001,
  },
  {
    id: "B",
    name: "Three-quarter portrait",
    prompt:
      "photo of vivienv2x woman, close-up three-quarter portrait, calm expression, soft beige background, natural window light, photorealistic, realistic skin texture",
    seed: 42002,
  },
  {
    id: "C",
    name: "Medium lifestyle",
    prompt:
      "photo of vivienv2x woman, waist-up portrait, standing in an elegant apartment, wearing a fitted black top, natural window light, photorealistic",
    seed: 42003,
  },
  {
    id: "D",
    name: "Full-body fashion",
    prompt:
      "photo of vivienv2x woman, full-body photograph, standing naturally in an elegant hotel interior, wearing a simple black dress, realistic body proportions, photorealistic",
    seed: 42004,
  },
  {
    id: "E",
    name: "Casual lifestyle",
    prompt:
      "photo of vivienv2x woman, seated beside a window, wearing blue jeans and a cream blouse, relaxed natural pose, soft daylight, photorealistic",
    seed: 42005,
  },
  {
    id: "F",
    name: "Silk robe",
    prompt:
      "photo of vivienv2x woman, seated on the edge of a bed in an elegant hotel room, wearing a cream silk robe, tasteful boudoir photography, soft natural window light, photorealistic",
    seed: 42006,
  },
  {
    id: "G",
    name: "Lingerie",
    prompt:
      "photo of vivienv2x woman, seated in a lounge chair beside a window, wearing refined black lace lingerie, elegant interior, soft daylight, tasteful sensual photography, photorealistic",
    seed: 42007,
  },
  {
    id: "H",
    name: "Out-of-dataset generalization",
    prompt:
      "photo of vivienv2x woman, standing in a modern minimalist kitchen, wearing a dark green fitted dress, natural morning light, candid photorealistic photography",
    seed: 42008,
  },
];

const loraStrengths = [0.45, 0.6, 0.7, 0.85];

interface TestResult {
  scene_id: string;
  scene_name: string;
  prompt: string;
  strength: number;
  seed: number;
  image_url: string;
  image_size: string;
  generated_at: string;
}

async function runBenchmark() {
  console.log(`\n🧪 VIVIEN LORA V2 VALIDATION BENCHMARK\n`);
  console.log(`   LoRA: ${loraUrl.split("/").pop()}`);
  console.log(`   Trigger: vivienv2x`);
  console.log(`   Scenes: ${benchmarkScenes.length}`);
  console.log(`   Strengths: ${loraStrengths.join(", ")}`);
  console.log(
    `   Total images: ${benchmarkScenes.length * loraStrengths.length}\n`
  );

  const results: TestResult[] = [];
  let count = 0;
  let totalCount = benchmarkScenes.length * loraStrengths.length;

  for (const scene of benchmarkScenes) {
    console.log(`📸 Scene ${scene.id}: ${scene.name}`);

    for (const strength of loraStrengths) {
      count++;
      process.stdout.write(`   [${count}/${totalCount}] strength ${strength}... `);

      try {
        const result = await fal.subscribe("fal-ai/flux-pro", {
          input: {
            prompt: scene.prompt,
            seed: scene.seed,
            loras: [
              {
                url: loraUrl,
                weight: strength,
              },
            ],
            num_inference_steps: 28,
            guidance_scale: 3.5,
            image_size: "square_hd", // 1024x1024
          },
        });

        const imageUrl = (result as any)?.images?.[0]?.url;

        if (imageUrl) {
          results.push({
            scene_id: scene.id,
            scene_name: scene.name,
            prompt: scene.prompt,
            strength,
            seed: scene.seed,
            image_url: imageUrl,
            image_size: "1024x1024",
            generated_at: new Date().toISOString(),
          });
          console.log("✅");
        } else {
          console.log("⚠️ (no image)");
        }
      } catch (err) {
        console.log(`❌ Error: ${err instanceof Error ? err.message : err}`);
      }
    }

    console.log();
  }

  // Save results
  await fs.writeFile(
    "artifacts/vivien_lora_v2/tests/benchmark_validation.json",
    JSON.stringify(
      {
        lora_url: loraUrl,
        total_scenes: benchmarkScenes.length,
        total_strengths: loraStrengths.length,
        total_images: benchmarkScenes.length * loraStrengths.length,
        completed_images: results.length,
        scenes: benchmarkScenes.map((s) => ({
          id: s.id,
          name: s.name,
          seed: s.seed,
        })),
        strengths: loraStrengths,
        results,
        generated_at: new Date().toISOString(),
      },
      null,
      2
    )
  );

  console.log(`✅ Benchmark complete!\n`);
  console.log(`   Generated: ${results.length} images`);
  console.log(`   Saved: artifacts/vivien_lora_v2/tests/benchmark_validation.json`);
  console.log(
    `\n📋 Next: Manual scoring and baseline comparison (see VALIDATION.md)\n`
  );
}

runBenchmark().catch((err) => {
  console.error(`Error:`, err instanceof Error ? err.message : err);
  process.exit(1);
});

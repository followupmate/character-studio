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
  console.error(
    "❌ CIVITAI_API_KEY not found in .env.local\n" +
    "Add this line to .env.local:\n" +
    "CIVITAI_API_KEY=your_token_here\n\n" +
    "Get token at: https://civitai.com/ → Account Settings → API Tokens"
  );
  process.exit(1);
}

const API_BASE = "https://orchestration.civitai.com/v2/consumer/workflows";
const MODEL_AIR = "urn:air:sdxl:checkpoint:civitai:443821@2884631"; // CyberRealistic Pony v18.0

// Test prompts from validation plan
const testSuites = [
  {
    id: "A",
    name: "Natural Portrait",
    positive: `score_9, score_8_up, score_7_up,
(1girl:1.3), solo,
close-up portrait, looking at viewer, calm expression,
realistic skin texture, soft natural daylight,
plain light background,
(photorealistic:1.4), (highly detailed face:1.2),
professional photography, (soft lighting:1.1)`,
    negative: `score_6, score_5, score_4,
worst quality, low quality, bad anatomy,
watermarks, text, unnatural proportions,
makeup, filter, oversaturated`,
    seedBase: 10001,
  },
  {
    id: "B",
    name: "Simple Black Dress",
    positive: `score_9, score_8_up, score_7_up,
(1girl:1.3), solo, full body,
standing naturally in elegant hotel interior,
wearing simple black dress, fitted,
realistic body proportions,
(photorealistic:1.4), detailed skin texture,
soft natural light, cinematic lighting,
(beautiful face:1.2), calm confident expression`,
    negative: `score_6, score_5, score_4,
worst quality, low quality,
bad hands, extra limbs, distorted body,
watermarks, blurred, oversaturated,
artificial look, CGI`,
    seedBase: 20001,
  },
  {
    id: "C",
    name: "Lingerie in Luxury",
    positive: `score_9, score_8_up, score_7_up,
(1girl:1.3), solo,
waist-up to full body,
sitting on luxurious bed, elegant bedroom interior,
wearing elegant black lace lingerie,
(photorealistic:1.4), detailed skin texture,
soft golden hour light through windows,
(beautiful face:1.2), seductive but tasteful expression,
(high quality lighting:1.1), cinematic mood,
artistic composition`,
    negative: `score_6, score_5, score_4,
worst quality, low quality, bad anatomy,
watermarks, excessive makeup, artificial skin,
extreme close-up genitalia, hardcore elements,
blurred, low resolution, text`,
    seedBase: 30001,
  },
  {
    id: "D",
    name: "Silk Robe",
    positive: `score_9, score_8_up, score_7_up,
(1girl:1.3), solo,
waist-up to full body,
sitting upright on edge of elegant bed,
wearing cream silk robe, loosely draped,
face clearly visible, looking toward camera,
(photorealistic:1.4), detailed natural skin,
soft window light, warm tones,
(beautiful face:1.2), serene expression,
tasteful boudoir aesthetic, artistic mood,
(professional lighting:1.1)`,
    negative: `score_6, score_5, score_4,
worst quality, low quality, bad hands,
watermarks, artificial look, plastic skin,
extreme nudity, hardcore content,
oversaturated, blurred focus, text`,
    seedBase: 40001,
  },
  {
    id: "E",
    name: "Artistic Nudity",
    positive: `score_9, score_8_up, score_7_up,
(1girl:1.3), solo,
artistic pose, tastefully covered by fabric,
(photorealistic:1.4), professional art photography,
studio lighting, dramatic shadows,
(beautiful detailed face:1.2), serene contemplative expression,
natural skin texture, skin detail,
(professional composition:1.1),
gallery-quality, tasteful eroticism,
(warm mood lighting:1.0)`,
    negative: `score_6, score_5, score_4,
worst quality, low quality, watermarks,
bad anatomy, extra limbs, distorted,
hardcore content, extreme close-ups,
artificial, blurred, low resolution, text`,
    seedBase: 50001,
  },
  {
    id: "F",
    name: "Strong Erotic Content",
    positive: `score_9, score_8_up, score_7_up,
(1girl:1.3), solo,
nude or lingerie, reclining on bed, seductive pose,
bedroom interior, luxury setting,
(photorealistic:1.4), highly detailed body,
skin detail, realistic anatomy,
soft intimate lighting, warm tones,
(beautiful face:1.2), seductive expression,
erotic mood, adult content aesthetic,
(professional composition:1.1),
suitable for adult subscription platform`,
    negative: `score_6, score_5, score_4,
worst quality, low quality, watermarks,
bad anatomy, distorted body, extra limbs,
extreme hardcore content, feces, violence,
artificial skin, oversaturated, blurred, text`,
    seedBase: 60001,
  },
];

interface GenerationResult {
  suiteId: string;
  suiteName: string;
  variant: number;
  seed: number;
  status: "success" | "error";
  imageUrl?: string;
  imageId?: string;
  workflowId?: string;
  error?: string;
  generatedAt?: string;
}

async function generateImage(
  suite: (typeof testSuites)[0],
  variant: number
): Promise<GenerationResult> {
  const seed = suite.seedBase + variant - 1;
  const prompt = `${suite.positive}\n\nNegative: ${suite.negative}`;

  const payload = {
    steps: [
      {
        $type: "imageGen",
        input: {
          engine: "sdcpp",
          ecosystem: "sdxl",
          operation: "createImage",
          model: MODEL_AIR,
          prompt: suite.positive,
          negativePrompt: suite.negative,
          width: 896,
          height: 1152,
          steps: 30,
          cfgScale: 5,
          seed: seed,
        },
      },
    ],
  };

  try {
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
        suiteId: suite.id,
        suiteName: suite.name,
        variant,
        seed,
        status: "success",
        imageUrl: imageData.url,
        imageId: imageData.id,
        workflowId: result.id,
        generatedAt: new Date().toISOString(),
      };
    } else {
      throw new Error(
        `Unexpected response status: ${result.status} - ${JSON.stringify(result)}`
      );
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      suiteId: suite.id,
      suiteName: suite.name,
      variant,
      seed,
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
    return true;
  } catch (err) {
    console.error(`  ❌ Download failed: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

async function runValidation() {
  console.log(`\n🎨 CIVITAI PONY MODEL VALIDATION — IMAGE GENERATION\n`);
  console.log(`   Model: CyberRealistic Pony v18.0 CoreShift`);
  console.log(`   Ecosystem: SDXL`);
  console.log(`   Tests: 6 suites × 3 variants = 18 images`);
  console.log(`   Settings: DPM++ 2M Karras, 30 steps, CFG 5, Clip Skip 2\n`);

  const outputDir = "civitai_validation";
  await fs.mkdir(outputDir, { recursive: true });

  const results: GenerationResult[] = [];
  let count = 0;
  const total = testSuites.length * 3;

  for (const suite of testSuites) {
    console.log(`\n📸 Suite ${suite.id}: ${suite.name}`);

    for (let variant = 1; variant <= 3; variant++) {
      count++;
      process.stdout.write(
        `   [${count}/${total}] Variant ${variant} (seed ${suite.seedBase + variant - 1})... `
      );

      const result = await generateImage(suite, variant);
      results.push(result);

      if (result.status === "success") {
        // Download image
        const filename = `prompt_${suite.id}_variant_${variant}.jpg`;
        const filepath = `${outputDir}/${filename}`;

        if (result.imageUrl) {
          process.stdout.write("(downloading...) ");
          const downloaded = await downloadImage(result.imageUrl, filepath);
          if (downloaded) {
            const fileInfo = await fs.stat(filepath);
            const sizeKB = (fileInfo.size / 1024).toFixed(1);
            console.log(`✅ (${sizeKB} KB)`);
          } else {
            console.log("⚠️ (generated but download failed)");
          }
        } else {
          console.log("⚠️ (no image URL in response)");
        }
      } else {
        console.log(`❌ Error: ${result.error}`);
      }

      // Rate limit: wait 1 second between requests
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  // Save results metadata
  const metadata = {
    model: {
      name: "CyberRealistic Pony",
      version: "v18.0 CoreShift",
      air: MODEL_AIR,
      modelId: 443821,
      versionId: 2884631,
    },
    settings: {
      engine: "comfy",
      ecosystem: "sdxl",
      sampler: "dpmpp_2m_karras",
      steps: 30,
      cfgScale: 5,
      clipSkip: 2,
      width: 896,
      height: 1152,
      aspectRatio: "3:4",
    },
    results: results,
    generatedAt: new Date().toISOString(),
    totalImages: total,
    successCount: results.filter((r) => r.status === "success").length,
    failureCount: results.filter((r) => r.status === "error").length,
  };

  await fs.writeFile(
    `${outputDir}/generation_results.json`,
    JSON.stringify(metadata, null, 2)
  );

  console.log(`\n✅ GENERATION COMPLETE\n`);
  console.log(`   Generated: ${metadata.successCount}/${total} images`);
  console.log(`   Failed: ${metadata.failureCount}`);
  console.log(`   Saved to: ${outputDir}/`);
  console.log(`   Metadata: ${outputDir}/generation_results.json\n`);
  console.log(`📋 Next: Visual evaluation using scoring rubric\n`);
}

runValidation().catch((err) => {
  console.error(
    `❌ Fatal error:`,
    err instanceof Error ? err.message : err
  );
  process.exit(1);
});

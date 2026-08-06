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
  console.error("❌ CIVITAI_API_KEY not found");
  process.exit(1);
}

const ORCHESTRATION_BASE = "https://orchestration.civitai.com/v2/consumer";

interface TrainingConfig {
  baseModelId: string;
  modelName: string;
  triggerWord: string;
  epochs: number;
  learningRate: number;
  rank: number;
  alpha: number;
  resolution: number;
  scheduler: string;
  optimizer: string;
  autoCaptioning: boolean;
  imageUrls: Array<{ url: string; caption: string }>;
}

// All 25 image URLs from Higgsfield (public CDN)
const IMAGE_URLS = [
  { url: "https://d8j0ntlcm91z4.cloudfront.net/user_3DIN7iizyGlbATv0YsKCQuyiU6L/hf_20260806_125945_c76e4743-55a9-4336-aa5a-317111d0f009.png", caption: "mychar_soul, close-up portrait, neutral expression, soft natural daylight" },
  { url: "https://d8j0ntlcm91z4.cloudfront.net/user_3DIN7iizyGlbATv0YsKCQuyiU6L/hf_20260806_125945_0e476d71-65a1-4755-bca8-4a6605023228.png", caption: "mychar_soul, close-up portrait, slight smile, warm golden hour" },
  { url: "https://d8j0ntlcm91z4.cloudfront.net/user_3DIN7iizyGlbATv0YsKCQuyiU6L/hf_20260806_125944_d9ee008a-f4c2-46f5-92a7-931c2b41f977.png", caption: "mychar_soul, portrait 3/4 angle, cool blue ambient light" },
  { url: "https://d8j0ntlcm91z4.cloudfront.net/user_3DIN7iizyGlbATv0YsKCQuyiU6L/hf_20260806_125945_764c697d-f2b1-490c-adb3-d657699bf232.png", caption: "mychar_soul, portrait 3/4 angle, dramatic side lighting" },
  { url: "https://d8j0ntlcm91z4.cloudfront.net/user_3DIN7iizyGlbATv0YsKCQuyiU6L/hf_20260806_125944_99dbe9ff-15c6-40bc-be78-5807d363fb64.png", caption: "mychar_soul, profile view, backlit by sunset" },
  { url: "https://d8j0ntlcm91z4.cloudfront.net/user_3DIN7iizyGlbATv0YsKCQuyiU6L/hf_20260806_125945_a0c41ee3-648b-4619-bcd5-4d684946a8de.png", caption: "mychar_soul, close-up, looking down, soft lamp light" },
  { url: "https://d8j0ntlcm91z4.cloudfront.net/user_3DIN7iizyGlbATv0YsKCQuyiU6L/hf_20260806_125945_ecfa1811-cbfe-4a97-a701-115e666ffec0.png", caption: "mychar_soul, close-up, surprised expression, bright lighting" },
  { url: "https://d8j0ntlcm91z4.cloudfront.net/user_3DIN7iizyGlbATv0YsKCQuyiU6L/hf_20260806_125945_3b61603d-ac2a-407b-afc3-85e3793c444b.png", caption: "mychar_soul, wet hair portrait, bathroom mirror, steamy" },
  { url: "https://d8j0ntlcm91z4.cloudfront.net/user_3DIN7iizyGlbATv0YsKCQuyiU6L/hf_20260806_125945_16ffafd4-4c86-40eb-9c54-0b3bdcd7667b.png", caption: "mychar_soul, upper body, white t-shirt, urban background" },
  { url: "https://d8j0ntlcm91z4.cloudfront.net/user_3DIN7iizyGlbATv0YsKCQuyiU6L/hf_20260806_125945_ed369107-428c-4bc6-837d-f7689cb6b9ae.png", caption: "mychar_soul, upper body, black turtleneck, cafe" },
  { url: "https://d8j0ntlcm91z4.cloudfront.net/user_3DIN7iizyGlbATv0YsKCQuyiU6L/hf_20260806_125945_e9171685-8e6e-4b92-8d80-bcd424306636.png", caption: "mychar_soul, upper body, linen shirt, beach wind" },
  { url: "https://d8j0ntlcm91z4.cloudfront.net/user_3DIN7iizyGlbATv0YsKCQuyiU6L/hf_20260806_125945_fce52da5-abce-42db-932f-fc1861b08b36.png", caption: "mychar_soul, upper body, leather jacket, night city" },
  { url: "https://d8j0ntlcm91z4.cloudfront.net/user_3DIN7iizyGlbATv0YsKCQuyiU6L/hf_20260806_130048_15a4b385-fb1a-4e04-a0cb-27eecaafcf56.png", caption: "mychar_soul, upper body, tank top, stretching, morning light" },
  { url: "https://d8j0ntlcm91z4.cloudfront.net/user_3DIN7iizyGlbATv0YsKCQuyiU6L/hf_20260806_130048_73a7c6c5-209c-4b97-979e-42a8fc6cefc4.png", caption: "mychar_soul, upper body, hoodie, sitting on stairs" },
  { url: "https://d8j0ntlcm91z4.cloudfront.net/user_3DIN7iizyGlbATv0YsKCQuyiU6L/hf_20260806_130048_7cc89938-9323-48a6-aeb5-59e035bbe8a2.png", caption: "mychar_soul, upper body, elegant blouse, office desk" },
  { url: "https://d8j0ntlcm91z4.cloudfront.net/user_3DIN7iizyGlbATv0YsKCQuyiU6L/hf_20260806_130048_92d26123-55b1-42db-a6fc-92e0dc1f04d5.png", caption: "mychar_soul, full body, standing, jeans, park" },
  { url: "https://d8j0ntlcm91z4.cloudfront.net/user_3DIN7iizyGlbATv0YsKCQuyiU6L/hf_20260806_130048_be2a3449-a811-491c-848c-a86ecc1da9e3.png", caption: "mychar_soul, full body, sitting, summer dress, garden" },
  { url: "https://d8j0ntlcm91z4.cloudfront.net/user_3DIN7iizyGlbATv0YsKCQuyiU6L/hf_20260806_130048_76b76ee7-1899-4c77-be0b-4c4a41ce4bc6.png", caption: "mychar_soul, full body, walking, athletic wear, gym" },
  { url: "https://d8j0ntlcm91z4.cloudfront.net/user_3DIN7iizyGlbATv0YsKCQuyiU6L/hf_20260806_130048_0a6ae334-15f9-44e6-8316-324b494e5d6a.png", caption: "mychar_soul, full body, leaning, crop top, rooftop" },
  { url: "https://d8j0ntlcm91z4.cloudfront.net/user_3DIN7iizyGlbATv0YsKCQuyiU6L/hf_20260806_130048_b53364d6-8d63-44ea-a7fe-6ca610296d86.png", caption: "mychar_soul, full body, lying on couch, pajamas" },
  { url: "https://d8j0ntlcm91z4.cloudfront.net/user_3DIN7iizyGlbATv0YsKCQuyiU6L/hf_20260806_130048_d216927e-fc31-49d8-8ce8-0a399a2aa8d7.png", caption: "mychar_soul, full body, dancing, flowing skirt, dramatic" },
  { url: "https://d8j0ntlcm91z4.cloudfront.net/user_3DIN7iizyGlbATv0YsKCQuyiU6L/hf_20260806_130048_a5463f79-b9d4-4cd2-8897-bcd8220b1bb4.png", caption: "mychar_soul, full body, kneeling, sweater, minimalist" },
  { url: "https://d8j0ntlcm91z4.cloudfront.net/user_3DIN7iizyGlbATv0YsKCQuyiU6L/hf_20260806_130048_241922b8-d659-468d-b805-8761130f7ddb.png", caption: "mychar_soul, candid shot, laughing, party lights" },
  { url: "https://d8j0ntlcm91z4.cloudfront.net/user_3DIN7iizyGlbATv0YsKCQuyiU6L/hf_20260806_130123_35f28a6b-7b84-4126-9d69-f7b6a8152195.png", caption: "mychar_soul, moody portrait, serious, rainy window, cinematic" },
  { url: "https://d8j0ntlcm91z4.cloudfront.net/user_3DIN7iizyGlbATv0YsKCQuyiU6L/hf_20260806_130123_60d4c492-a7ad-4143-9951-8d46619afe2d.png", caption: "mychar_soul, bright airy portrait, white dress, flower field" },
];

async function submitLoRATrainingWithUrls(
  config: TrainingConfig
): Promise<string> {
  console.log("\n🚀 Starting LoRA Training (URL-based)");
  console.log("===================================\n");

  console.log("📋 Training Configuration:");
  console.log(`   Base Model ID: ${config.baseModelId}`);
  console.log(`   Model Name: ${config.modelName}`);
  console.log(`   Trigger Word: ${config.triggerWord}`);
  console.log(`   Epochs: ${config.epochs}`);
  console.log(`   Learning Rate: ${config.learningRate}`);
  console.log(`   Rank: ${config.rank}`);
  console.log(`   Alpha: ${config.alpha}`);
  console.log(`   Resolution: ${config.resolution}`);
  console.log(`   Scheduler: ${config.scheduler}`);
  console.log(`   Optimizer: ${config.optimizer}`);
  console.log(`   Auto-Captioning: ${config.autoCaptioning ? "Yes (WD Tagger)" : "No"}`);
  console.log(`   Dataset Size: ${config.imageUrls.length} images\n`);

  // Prepare payload with image URLs
  const payload = {
    engine: "training", // Required for Civitai API
    inputs: {
      // Model configuration
      modelId: config.baseModelId,
      name: config.modelName,
      description: `LoRA trained with Vivienne Soul ID character dataset. Trigger word: ${config.triggerWord}`,

      // Images from public URLs
      images: config.imageUrls.map((img) => ({
        url: img.url,
        caption: img.caption,
      })),

      // Training hyperparameters
      trainingParams: {
        epochs: config.epochs,
        learningRate: config.learningRate,
        networkDim: config.rank,
        networkAlpha: config.alpha,
        resolution: config.resolution,
        scheduler: config.scheduler,
        optimizer: config.optimizer,
        trainBatchSize: 1,
        gradAccumSteps: 1,
        mixedPrecision: "bf16",
      },

      // Trigger word and captioning
      triggerWord: config.triggerWord,
      captioning: {
        enabled: config.autoCaptioning,
        model: "wd_tagger",
        prefix: config.triggerWord,
      },

      // Model type
      type: "lora",
      loraType: "standard",
      baseModel: {
        id: config.baseModelId,
        type: "checkpoint",
      },
    },
  };

  console.log("📤 Submitting training request...\n");

  try {
    const endpoint = `${ORCHESTRATION_BASE}/recipes/imageResourceTraining`;
    console.log(`🔗 POST ${endpoint}\n`);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${CIVITAI_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    console.log(`📊 Response Status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("\n❌ API Error Response:");
      console.error(errorText.substring(0, 800));
      throw new Error(`API Error ${response.status}`);
    }

    const result = await response.json() as any;
    console.log("\n✅ Training Submitted Successfully!\n");

    const jobId =
      result.jobId ||
      result.id ||
      result.trainingId ||
      result.job?.id ||
      result.recipe?.id;

    console.log("📊 Training Job Details:");
    console.log(`   Job ID: ${jobId}`);
    console.log(`   Model Name: ${config.modelName}`);
    console.log(`   Trigger Word: ${config.triggerWord}`);
    console.log(`   Images: ${config.imageUrls.length}`);
    console.log(`   Epochs: ${config.epochs}`);
    console.log(`   Status: ${result.status || "Submitted"}`);

    if (result.estimatedTime) {
      console.log(`   Estimated Time: ${result.estimatedTime}`);
    }

    console.log("\n🔗 View on Civitai:");
    console.log(`   https://civitai.com/user/training`);

    if (result) {
      console.log("\n📋 Response Details:");
      console.log(JSON.stringify(result, null, 2).substring(0, 600));
    }

    return jobId || "training-submitted";

  } catch (error) {
    console.error("❌ Failed to submit training:", error);
    throw error;
  }
}

async function main() {
  try {
    const config: TrainingConfig = {
      baseModelId: "635127", // CyberRealistic Pony v18.0 CoreShift
      modelName: "Vivienne_LoRA_Soul_v1",
      triggerWord: "mychar_soul",
      epochs: 12,
      learningRate: 0.0001,
      rank: 32,
      alpha: 16,
      resolution: 1024,
      scheduler: "cosine_with_restarts",
      optimizer: "AdamW8bit",
      autoCaptioning: true,
      imageUrls: IMAGE_URLS,
    };

    console.log("🎬 Civitai LoRA Training - URL-based Pipeline");
    console.log("============================================");

    const jobId = await submitLoRATrainingWithUrls(config);

    console.log("\n🎉 Training Pipeline Complete!");
    console.log(`\n📌 Job ID: ${jobId}`);
    console.log(`Model: ${config.modelName}`);
    console.log(`Trigger: ${config.triggerWord}`);
    console.log(`Images: ${config.imageUrls.length}`);

  } catch (error) {
    console.error("\n❌ Pipeline Error:", error);
    process.exit(1);
  }
}

main();

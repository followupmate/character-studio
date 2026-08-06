import { fal } from "@fal-ai/client";

const requestId = process.argv[2] || "019fd5f8-9dd0-7c03-9aea-a4f94138cdfa";

async function checkStatus() {
  const falApiKey = process.env.FAL_API_KEY;
  if (!falApiKey) throw new Error("FAL_API_KEY not configured");

  fal.config({ credentials: falApiKey });

  console.log(`🔍 Checking training status: ${requestId}\n`);

  try {
    const status = await fal.queue.status("fal-ai/flux-lora-fast-training", {
      requestId,
    });

    console.log(`Status:`, JSON.stringify(status, null, 2));

    // If completed, try to get result
    if ((status as any).status === "COMPLETED") {
      console.log(`\n📥 Fetching result...`);
      const result = await fal.queue.result("fal-ai/flux-lora-fast-training", {
        requestId,
      });
      console.log(`Result:`, JSON.stringify(result, null, 2));
    }
  } catch (err) {
    console.error(`❌ Error:`, err instanceof Error ? err.message : err);
  }
}

checkStatus();

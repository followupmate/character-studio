import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function listFiles() {
  try {
    // List buckets
    const { data: buckets } = await supabase.storage.listBuckets();
    console.log("📦 Available buckets:");
    buckets?.forEach((b) => console.log(`   - ${b.name}`));

    // List files in vivien-lora-v2 bucket
    console.log("\n📋 Files in vivien-lora-v2:");
    const { data: files, error } = await supabase.storage
      .from("vivien-lora-v2")
      .list("", { limit: 100, offset: 0 });

    if (error) {
      console.error(`   Error listing files: ${error.message}`);
    } else if (files) {
      files.forEach((f) => {
        console.log(`   - ${f.name} (${f.metadata?.size || 0} bytes)`);
      });

      // Try to get public URL for each file
      console.log("\n🔗 Public URLs:");
      for (const file of files) {
        const { data } = supabase.storage
          .from("vivien-lora-v2")
          .getPublicUrl(file.name);
        console.log(`   ${file.name}:`);
        console.log(`   ${data.publicUrl}`);
      }
    }
  } catch (err) {
    console.error(`Error:`, err);
  }
}

listFiles();

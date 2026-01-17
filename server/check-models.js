const dotenv = require('dotenv');
dotenv.config(); 

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("❌ No GEMINI_API_KEY found in .env file");
  process.exit(1);
}

const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

async function checkModels() {
  try {
    console.log("🔍 Checking available models for your API key...");
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      console.error("❌ API Error:", data.error.message);
      return;
    }

    const availableModels = data.models
      // Filter for models that support "generateContent" (chat/vision)
      .filter(m => m.supportedGenerationMethods.includes("generateContent"))
      .map(m => m.name.replace("models/", ""));

    console.log("\n✅ AVAILABLE MODELS (Copy one of these):");
    console.log("-----------------------------------------");
    availableModels.forEach(name => console.log(`"${name}"`));
    console.log("-----------------------------------------");

  } catch (error) {
    console.error("❌ Network Error:", error.message);
  }
}

checkModels();
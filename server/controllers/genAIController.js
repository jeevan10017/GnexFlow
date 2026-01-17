// controllers/genAIController.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- HELPER: Fallback System ---
async function tryGenerateContent(prompt, imagePart) {
    const modelsToTry = ["gemini-2.0-flash", "gemini-2.5-pro", "gemini-2.5-flash"];
    let lastError = null;

    for (const modelName of modelsToTry) {
        try {
            console.log(`🤖 Trying model: ${modelName}...`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent([prompt, imagePart]);
            const response = await result.response;
            return response.text();
        } catch (error) {
            console.warn(`⚠️ Model ${modelName} failed: ${error.message}`);
            lastError = error;
        }
    }
    throw lastError;
}

// --- HELPER: File Processing ---
function fileToGenerativePart(base64Image, mimeType) {
    return {
        inlineData: {
            data: base64Image.split(',')[1],
            mimeType
        },
    };
}

// --- CONTROLLER 1: Sketch-to-Image (SVG) ---
exports.enhanceImage = async (req, res) => {
    try {
        const { image, userPrompt } = req.body;
        if (!image) return res.status(400).json({ error: "No image provided" });

        const specificInstruction = userPrompt 
            ? `USER REQUEST: "${userPrompt}". Follow this strictly.` 
            : "Use nice colors (blue/purple/gray) and match the sketch layout.";

        const prompt = `
          You are an expert SVG Artist. 
          Task: Convert this UI sketch into a clean, professional SVG vector graphic.
          
          ${specificInstruction}
          
          Requirements:
          1. OUTPUT FORMAT: Return ONLY the raw <svg> code. No markdown, no "Here is your code".
          2. XMLNS: Ensure the <svg> tag has xmlns="http://www.w3.org/2000/svg".
          3. BACKGROUND: **IMPORTANT** - The background must be TRANSPARENT. Do NOT add a solid <rect> behind the entire image (unless the user specifically asked for a 'card' or 'background').
          4. STYLE: Use smooth curves and professional gradients where appropriate.
        `;

        const imagePart = fileToGenerativePart(image, "image/png");
        let text = await tryGenerateContent(prompt, imagePart);

        // Extraction Logic
        const svgStart = text.indexOf('<svg');
        const svgEnd = text.lastIndexOf('</svg>');
        if (svgStart !== -1 && svgEnd !== -1) {
            text = text.substring(svgStart, svgEnd + 6);
        } else {
            text = text.replace(/```xml/g, "").replace(/```svg/g, "").replace(/```/g, "").trim();
        }

        res.json({ type: "SVG Art", code: text });

    } catch (error) {
        console.error("Gemini Image Gen Error:", error);
        const status = error.message?.includes("429") ? 429 : 500;
        res.status(status).json({ error: "AI Busy. Please wait 30s and try again." });
    }
};

// --- CONTROLLER 2: Sketch-to-Code (React) ---
exports.generateCode = async (req, res) => {
    try {
        const { image, userPrompt } = req.body;
        if (!image) return res.status(400).json({ error: "No image provided" });

        const specificInstruction = userPrompt 
            ? `USER CUSTOM INSTRUCTION: "${userPrompt}". Incorporate this into the code.` 
            : "";

        const prompt = `
          You are an expert React Developer. Analyze the UI sketch in this image.
          
          ${specificInstruction}

          1. Detect if it is a Frontend UI, Database, or System Design.
          2. Generate the corresponding code.
          
          Return ONLY a raw JSON object (no markdown) with this structure:
          {
            "type": "Frontend UI",
            "code": " ... code here ... "
          }
        `;

        const imagePart = fileToGenerativePart(image, "image/png");
        let text = await tryGenerateContent(prompt, imagePart);

        text = text.replace(/```json/g, "").replace(/```/g, "").trim();
        let jsonResult;
        try { jsonResult = JSON.parse(text); } catch (e) { jsonResult = { type: "Generated Code", code: text }; }

        res.json(jsonResult);

    } catch (error) {
        console.error("Gemini Code Gen Error:", error);
        res.status(500).json({ error: "Model failed" });
    }
};
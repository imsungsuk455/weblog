import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import fs from "fs";
import path from "path";
import open from "open";
import { GoogleGenerativeAI } from "@google/generative-ai";
import "dotenv/config";

const app = express();
const PORT = 3001;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static("scripts")); // Serve static files from scripts directory

let currentApiKey = process.env.GEMINI_API_KEY;
let genAI = new GoogleGenerativeAI(currentApiKey || "dummy");

// API route to generate content
app.post("/api/generate", async (req, res) => {
  const { topic } = req.body;
  if (!topic) {
    return res.status(400).json({ error: "Topic is required" });
  }

  const model = genAI.getGenerativeModel({ model: "gemini-3-flash" });
  const pubDate = new Date().toISOString();

  const prompt = `
    Generate a high-quality blog post about: ${topic}.
    The output must be in Markdown format with the following frontmatter structure:

    ---
    author: AI Assistant
    pubDatetime: ${pubDate}
    title: [Title of the post]
    featured: false
    draft: true
    tags:
      - [tag1]
      - [tag2]
    description: [A short, engaging description of the post]
    ---

    [The post content in Markdown, with headings, lists, and clear explanations.]
    
    Return only the markdown content, no extra text.
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    res.json({ content: text.trim() });
  } catch (error) {
    console.error("Error generating post:", error);
    res.status(500).json({ error: "Failed to generate content: " + error.message });
  }
});

// API route to save content
app.post("/api/save", (req, res) => {
  const { content } = req.body;
  if (!content) {
    return res.status(400).json({ error: "Content is required" });
  }

  try {
    // Extract title for filename
    const titleMatch = content.match(/title:\s*(.*)/);
    const title = titleMatch ? titleMatch[1].trim().replace(/['"]/g, "") : "new-post";
    // Sanitize title for filename
    const sanitizedTitle = title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-");
    
    const dateStr = new Date().toISOString().split("T")[0];
    const fileName = `${dateStr}-${sanitizedTitle}.md`;
    const filePath = path.join(process.cwd(), "src/data/blog", fileName);

    // Create directory if not exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, content.trim());
    res.json({ message: "Post saved successfully", fileName });
  } catch (error) {
    console.error("Error saving post:", error);
    res.status(500).json({ error: "Failed to save post: " + error.message });
  }
});

// API route to get stats
app.get("/api/stats", (req, res) => {
  const blogDir = path.join(process.cwd(), "src/data/blog");
  try {
    if (!fs.existsSync(blogDir)) {
      return res.json({ total: 0, drafts: 0, published: 0 });
    }
    const files = fs.readdirSync(blogDir).filter(f => f.endsWith(".md"));
    let drafts = 0;
    files.forEach(f => {
      const content = fs.readFileSync(path.join(blogDir, f), "utf8");
      if (content.includes("draft: true")) drafts++;
    });
    res.json({
      total: files.length,
      drafts: drafts,
      published: files.length - drafts
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API route to list posts
app.get("/api/posts", (req, res) => {
  const blogDir = path.join(process.cwd(), "src/data/blog");
  try {
    if (!fs.existsSync(blogDir)) return res.json({ posts: [] });
    const files = fs.readdirSync(blogDir)
      .filter(f => f.endsWith(".md"))
      .map(f => {
        const stats = fs.statSync(path.join(blogDir, f));
        return {
          fileName: f,
          mtime: stats.mtime
        };
      })
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 10); // Latest 10
    res.json({ posts: files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API route to get config
app.get("/api/config", (req, res) => {
  const maskedKey = currentApiKey && currentApiKey.length > 10 
    ? `${currentApiKey.substring(0, 8)}...${currentApiKey.substring(currentApiKey.length - 4)}` 
    : (currentApiKey || "");
  res.json({ apiKey: maskedKey, isSet: !!currentApiKey });
});

// API route to update config
app.post("/api/config", (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey || apiKey.trim() === "") {
    return res.status(400).json({ error: "유효한 API 키를 입력해주세요." });
  }
  
  try {
    currentApiKey = apiKey.trim();
    genAI = new GoogleGenerativeAI(currentApiKey);
    
    // Update .env file
    const envPath = path.join(process.cwd(), ".env");
    let envContent = "";
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, "utf8");
    }

    if (envContent.includes("GEMINI_API_KEY=")) {
      envContent = envContent.replace(/GEMINI_API_KEY=.*/, `GEMINI_API_KEY=${currentApiKey}`);
    } else {
      envContent = envContent.trim() + `\nGEMINI_API_KEY=${currentApiKey}\n`;
    }
    fs.writeFileSync(envPath, envContent.trim() + "\n");
    
    res.json({ message: "API 키가 성공적으로 업데이트되었습니다." });
  } catch (err) {
    res.status(500).json({ error: "설정 업데이트 실패: " + err.message });
  }
});

// Serve the dashboard HTML
app.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), "scripts/dashboard.html"));
});

app.listen(PORT, () => {
  console.log(`\n---------------------------------`);
  console.log(`🚀 Dashboard server running at: http://localhost:${PORT}`);
  console.log(`---------------------------------\n`);
  open(`http://localhost:${PORT}`);
});

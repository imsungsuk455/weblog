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

let currentApiKey = process.env.GEMINI_API_KEY;
let currentUnsplashKey = process.env.UNSPLASH_ACCESS_KEY;
let genAI = new GoogleGenerativeAI(currentApiKey || "dummy");

// API route to generate content
app.post("/api/generate", async (req, res) => {
  const { topic } = req.body;
  if (!topic) {
    return res.status(400).json({ error: "Topic is required" });
  }

  const { category = "General" } = req.body;

  const model = genAI.getGenerativeModel({ 
    model: "gemini-3-flash-preview",
    tools: [
      {
        googleSearch: {},
      },
    ],
  });
  const pubDate = new Date().toISOString();

  const prompt = `
    당신은 쏟아지는 정보 속에서 핵심만 짚어주는 '닥터노마드(Dr. Nomad)' 블로그의 전문 에디터입니다. 당신의 목표는 독자의 자산을 지키는 유용한 경제/금융/IT 지식을 깔끔하게 정리해 제공하는 것입니다. 다음 주제에 대해 고품질의 블로그 글을 작성해 주세요.
    
    주제: ${topic}
    카테고리: ${category}

    [필수 구성 및 지침]
    1. 제목: 클릭을 부르는 매력적이고 구체적인 제목 (과장/낚시 금지)
    2. 서론 (3~5문단): 다룰 내용, 중요성, 독자가 얻는 이득을 자연스럽게 소개
    3. 본문 (소제목 H2 3~5개): 
       - 각 소제목 아래: 핵심 요약 1문장, 구체적인 설명 3~6문단
       - 예시, 단계별 목록(튜토리얼), 주의사항, 저자의 경험담 스타일의 팁 포함
    4. 결론 (2~4문장): 핵심 요약 및 2~3개의 실천 항목(Bullet list)
    5. Q&A: 글의 마지막에 질문과 답변 형식의 섹션 추가
    
    [톤 및 스타일]
    - 친절한 존댓말 블로그체, 짧고 명확한 문장
    - 한국 서비스와 상황을 우선으로 설명
    - 개인의 경험이나 의견, 생각을 반드시 포함하여 작성
    - 글자수는 2000자에서 3000자 사이로 풍부하게 작성 (중요)
    
    [이미지 구성 가이드 - 필수!]
    - 본문 중간중간(소제목 H2 아래)에 반드시 총 3개의 이미지가 들어갈 자리를 다음 형식으로 정확히 표기하세요: 
      [UNSPLASH: 이미지_검색_키워드]
    - 예시: 
      ## 1. 강아지 사료 고르는 법
      [UNSPLASH: healthy dog food]
      사료를 고를 때는 성분표를...
    - 썸네일은 자동으로 삽입되므로 본문에는 [UNSPLASH: ...] 태그만 3개 넣으세요.
    - 검색 키워드는 영어로 작성하는 것이 Unsplash 검색 결과가 더 좋습니다.
    
    [출력 형식]
    - 반드시 마크다운(Markdown) 형식을 사용하세요.
    - 제목(H1), 소제목(H2), 소소제목(H3)을 적절히 사용하세요.
    - 아래의 Frontmatter 구조를 글의 맨 처음에 반드시 포함하세요:

    ---
    author: AI Assistant
    pubDatetime: ${pubDate}
    title: [작성한 제목]
    featured: false
    draft: true
    tags:
      - [태그1]
      - [태그2]
    category: ${category}
    description: [글에 대한 짧고 매력적인 요약 설명]
    ---

    [이후 마크다운 본문 시작]
    
    반드시 마크다운 내용만 반환하고, 앞뒤에 불필요한 설명은 넣지 마세요.
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

// API route to get a specific post content
app.get("/api/posts/:fileName", (req, res) => {
  const { fileName } = req.params;
  const filePath = path.join(process.cwd(), "src/data/blog", fileName);
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf8");
      res.json({ content });
    } else { res.status(404).json({ error: "게시물을 찾을 수 없습니다." }); }
  } catch (err) { res.status(500).json({ error: "게시물 조회 실패: " + err.message }); }
});

// API route to delete a post
app.delete("/api/posts/:fileName", (req, res) => {
  const { fileName } = req.params;
  const filePath = path.join(process.cwd(), "src/data/blog", fileName);

  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({ message: "게시물이 성공적으로 삭제되었습니다." });
    } else {
      res.status(404).json({ error: "게시물을 찾을 수 없습니다." });
    }
  } catch (err) {
    console.error("Error deleting post:", err);
    res.status(500).json({ error: "게시물 삭제 실패: " + err.message });
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
        const filePath = path.join(blogDir, f);
        const stats = fs.statSync(filePath);
        const content = fs.readFileSync(filePath, "utf8");
        const draftMatch = content.match(/draft:\s*(true|false)/);
        const pubMatch = content.match(/pubDatetime:\s*(.*)/);
        return {
          fileName: f,
          mtime: stats.mtime,
          draft: draftMatch ? draftMatch[1] === "true" : false,
          pubDatetime: pubMatch ? pubMatch[1].trim() : null
        };
      })
      .sort((a, b) => b.mtime - a.mtime);
    res.json({ posts: files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API route to get post content
app.get("/api/post-content", (req, res) => {
  const { file } = req.query;
  if (!file) {
    return res.status(400).json({ error: "File name is required" });
  }

  const blogDir = path.join(process.cwd(), "src/data/blog");
  const filePath = path.join(blogDir, file);

  try {
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found" });
    }
    const content = fs.readFileSync(filePath, "utf8");
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API route to list categories
app.get("/api/categories", (req, res) => {
  const blogDir = path.join(process.cwd(), "src/data/blog");
  const categoriesDir = path.join(blogDir, ".categories");
  try {
    const categories = new Set(["General"]);

    // Load categories from marker files
    if (fs.existsSync(categoriesDir)) {
      const markerFiles = fs.readdirSync(categoriesDir).filter(f => f.endsWith(".txt"));
      markerFiles.forEach(f => {
        const categoryName = f.replace(".txt", "");
        categories.add(categoryName);
      });
    }

    // Also scan existing posts for categories
    if (fs.existsSync(blogDir)) {
      const files = fs.readdirSync(blogDir).filter(f => f.endsWith(".md"));
      files.forEach(f => {
        const content = fs.readFileSync(path.join(blogDir, f), "utf8");
        const match = content.match(/category:\s*(.*)/);
        if (match && match[1]) {
          categories.add(match[1].trim().replace(/['"]/g, ""));
        }
      });
    }

    res.json({ categories: Array.from(categories).sort() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API route to add category (create a marker file)
app.post("/api/categories", (req, res) => {
  const { category } = req.body;
  if (!category || category.trim() === "") {
    return res.status(400).json({ error: "카테고리 이름이 필요합니다." });
  }

  const blogDir = path.join(process.cwd(), "src/data/blog");
  const categoriesDir = path.join(blogDir, ".categories");

  try {
    // Create categories directory if not exists
    if (!fs.existsSync(categoriesDir)) {
      fs.mkdirSync(categoriesDir, { recursive: true });
    }

    // Create a marker file for the category
    const categoryFile = path.join(categoriesDir, `${category.trim()}.txt`);
    if (fs.existsSync(categoryFile)) {
      return res.status(400).json({ error: "이미 존재하는 카테고리입니다." });
    }

    fs.writeFileSync(categoryFile, `Category: ${category.trim()}\nCreated: ${new Date().toISOString()}\n`);
    res.json({ message: "카테고리가 추가되었습니다.", category: category.trim() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API route to delete category
app.delete("/api/categories", (req, res) => {
  const { category } = req.body;
  if (!category || category.trim() === "") {
    return res.status(400).json({ error: "카테고리 이름이 필요합니다." });
  }

  if (category === "General") {
    return res.status(400).json({ error: "기본 카테고리는 삭제할 수 없습니다." });
  }

  const blogDir = path.join(process.cwd(), "src/data/blog");
  const categoriesDir = path.join(blogDir, ".categories");
  const categoryFile = path.join(categoriesDir, `${category.trim()}.txt`);

  try {
    // Delete the category marker file
    if (fs.existsSync(categoryFile)) {
      fs.unlinkSync(categoryFile);
    }

    // Update posts that were in this category to "General"
    if (fs.existsSync(blogDir)) {
      const files = fs.readdirSync(blogDir).filter(f => f.endsWith(".md"));
      files.forEach(f => {
        const filePath = path.join(blogDir, f);
        let content = fs.readFileSync(filePath, "utf8");
        const categoryRegex = new RegExp(`category:\\s*['"]?${category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]?`, 'g');
        if (categoryRegex.test(content)) {
          content = content.replace(categoryRegex, "category: General");
          fs.writeFileSync(filePath, content);
        }
      });
    }

    res.json({ message: "카테고리가 삭제되었습니다." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API route to rename category
app.put("/api/categories", (req, res) => {
  const { oldName, newName } = req.body;
  if (!oldName || !newName || oldName.trim() === "" || newName.trim() === "") {
    return res.status(400).json({ error: "이전 이름과 새 이름이 모두 필요합니다." });
  }

  if (oldName === "General") {
    return res.status(400).json({ error: "기본 카테고리는 이름을 변경할 수 없습니다." });
  }

  const blogDir = path.join(process.cwd(), "src/data/blog");
  const categoriesDir = path.join(blogDir, ".categories");
  const oldFile = path.join(categoriesDir, `${oldName.trim()}.txt`);
  const newFile = path.join(categoriesDir, `${newName.trim()}.txt`);

  try {
    // Rename the category marker file
    if (fs.existsSync(oldFile)) {
      if (fs.existsSync(newFile)) {
        return res.status(400).json({ error: "이미 존재하는 카테고리 이름입니다." });
      }
      fs.renameSync(oldFile, newFile);
    }

    // Update posts that were in this category to the new name
    if (fs.existsSync(blogDir)) {
      const files = fs.readdirSync(blogDir).filter(f => f.endsWith(".md"));
      files.forEach(f => {
        const filePath = path.join(blogDir, f);
        let content = fs.readFileSync(filePath, "utf8");
        const categoryRegex = new RegExp(`category:\\s*['"]?${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]?`, 'g');
        if (categoryRegex.test(content)) {
          content = content.replace(categoryRegex, `category: ${newName.trim()}`);
          fs.writeFileSync(filePath, content);
        }
      });
    }

    res.json({ message: "카테고리 이름이 성공적으로 변경되었습니다." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API route to get config
app.get("/api/config", (req, res) => {
  const mask = (key) => key && key.length > 10
    ? `${key.substring(0, 8)}...${key.substring(key.length - 4)}`
    : (key || "");
  
  res.json({ 
    apiKey: mask(currentApiKey), 
    unsplashKey: mask(currentUnsplashKey),
    isSet: !!currentApiKey,
    isUnsplashSet: !!currentUnsplashKey
  });
});

// API route to update config
app.post("/api/config", (req, res) => {
  const { apiKey, unsplashKey } = req.body;
  
  try {
    let envPath = path.join(process.cwd(), ".env");
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";

    if (apiKey && apiKey.trim() !== "" && !apiKey.includes("...")) {
        currentApiKey = apiKey.trim();
        genAI = new GoogleGenerativeAI(currentApiKey);
        if (envContent.includes("GEMINI_API_KEY=")) {
          envContent = envContent.replace(/GEMINI_API_KEY=.*/, `GEMINI_API_KEY=${currentApiKey}`);
        } else {
          envContent += `\nGEMINI_API_KEY=${currentApiKey}`;
        }
    }

    if (unsplashKey && unsplashKey.trim() !== "" && !unsplashKey.includes("...")) {
        currentUnsplashKey = unsplashKey.trim();
        if (envContent.includes("UNSPLASH_ACCESS_KEY=")) {
          envContent = envContent.replace(/UNSPLASH_ACCESS_KEY=.*/, `UNSPLASH_ACCESS_KEY=${currentUnsplashKey}`);
        } else {
          envContent += `\nUNSPLASH_ACCESS_KEY=${currentUnsplashKey}`;
        }
    }

    fs.writeFileSync(envPath, envContent.trim() + "\n");
    res.json({ message: "설정이 성공적으로 업데이트되었습니다." });
  } catch (err) {
    res.status(500).json({ error: "설정 업데이트 실패: " + err.message });
  }
});

// API route to search Unsplash
app.get("/api/unsplash-search", async (req, res) => {
  const { query } = req.query;
  if (!currentUnsplashKey) {
    return res.status(400).json({ error: "Unsplash API 키가 설정되지 않았습니다." });
  }

  try {
    const response = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&client_id=${currentUnsplashKey}`);
    const data = await response.json();
    if (data.results && data.results.length > 0) {
      res.json({ url: data.results[0].urls.regular });
    } else {
      res.json({ url: "https://images.unsplash.com/photo-1499750310107-5fef28a66643?q=80&w=1000" }); // Fallback
    }
  } catch (err) {
    res.status(500).json({ error: "Unsplash 검색 실패: " + err.message });
  }
});

// API route to generate image
app.post("/api/generate-image", async (req, res) => {
  const { prompt, topic } = req.body;
  if (!prompt && !topic) {
    return res.status(400).json({ error: "Prompt or Topic is required" });
  }

  const imageModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash-image" });
  const imagePrompt = prompt || `A professional, high-quality blog banner image for the topic: ${topic}. Clean, modern, and engaging style.`;

  try {
    const result = await imageModel.generateContent(imagePrompt);
    const response = await result.response;
    // Assuming the response contains an image in the latest SDK modality
    const imagePart = response.candidates[0].content.parts.find(p => p.inlineData);
    
    if (!imagePart) {
      throw new Error("No image data returned from AI");
    }

    const buffer = Buffer.from(imagePart.inlineData.data, "base64");
    const filename = `ai-img-${Date.now()}.png`;
    const imageDir = path.join(process.cwd(), "public/assets/images");
    const imagePath = path.join(imageDir, filename);

    // Create directory if not exists
    if (!fs.existsSync(imageDir)) {
      fs.mkdirSync(imageDir, { recursive: true });
    }

    fs.writeFileSync(imagePath, buffer);
    res.json({ message: "이미지가 성공적으로 생성되었습니다.", url: `/assets/images/${filename}`, fileName: filename });
  } catch (err) {
    res.status(500).json({ error: "이미지 생성 실패: " + err.message });
  }
});

// API route to publish existing draft
app.post("/api/publish", (req, res) => {
  const { fileName } = req.body;
  if (!fileName) return res.status(400).json({ error: "Filename is required" });

  const blogDir = path.join(process.cwd(), "src/data/blog");
  const filePath = path.join(blogDir, fileName);

  try {
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "파일을 찾을 수 없습니다." });
    }

    let content = fs.readFileSync(filePath, "utf8");
    content = content.replace(/draft:\s*true/, "draft: false");
    fs.writeFileSync(filePath, content);

    res.json({ message: "게시물이 성공적으로 발행되었습니다." });
  } catch (err) {
    res.status(500).json({ error: "발행 중 오류 발생: " + err.message });
  }
});

// Serve static files from scripts directory (after API routes)
app.use(express.static("scripts"));
app.use("/assets/images", express.static(path.join(process.cwd(), "public/assets/images")));

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

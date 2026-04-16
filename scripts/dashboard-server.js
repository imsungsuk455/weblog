import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import open from "open";
import { spawn } from "child_process";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { registerFont, createCanvas, loadImage } from "canvas";
import { fileURLToPath } from "url";
import "dotenv/config";

// Register Korean font once at startup (use script-relative path to be safe)
const __scriptDir = path.dirname(fileURLToPath(import.meta.url));
registerFont(path.join(__scriptDir, "fonts/malgunbd.ttf"), { family: "MalgunGothic" });

const app = express();
const PORT = 3001;

app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));

let currentApiKey = process.env.GEMINI_API_KEY;
let currentUnsplashKey = process.env.UNSPLASH_ACCESS_KEY;
let genAI = new GoogleGenerativeAI(currentApiKey || "dummy");

// ── 멀티 블로그 설정 ──
// 블로그 키 → 절대 경로 (src/data/blog 상위 루트 경로)
const BLOGS = {
  weblog: path.resolve(process.cwd()),
  blog2: path.resolve(process.cwd(), "../blog2"),
  blog3: path.resolve(process.cwd(), "../blog3"),
};

// 유효한 블로그 키인지 검증 후 blogDir 반환
function getBlogDir(blogKey) {
  const key = blogKey && BLOGS[blogKey] ? blogKey : "weblog";
  return path.join(BLOGS[key], "src/data/blog");
}

// 유효한 블로그 키인지 검증 후 블로그 루트 반환
function getBlogRoot(blogKey) {
  const key = blogKey && BLOGS[blogKey] ? blogKey : "weblog";
  return BLOGS[key];
}

// 이미지 저장 디렉토리 (블로그별)
function getImageDir(blogKey) {
  return path.join(getBlogRoot(blogKey), "public/assets/images");
}

// 등록된 블로그 목록 조회
app.get("/api/blogs", (req, res) => {
  const list = Object.keys(BLOGS).map(key => ({
    key,
    root: BLOGS[key],
    exists: fs.existsSync(path.join(BLOGS[key], "src/data/blog")),
  }));
  res.json({ blogs: list });
});

// API route to generate content
app.post("/api/generate", async (req, res) => {
  const { topic } = req.body;
  if (!topic) {
    return res.status(400).json({ error: "Topic is required" });
  }

  const {
    category = "General",
    model: modelId = "gemini-3-flash-preview",
    writingStyle = "info",
    affiliateLinks = [],
  } = req.body;

  const aiModel = genAI.getGenerativeModel({ model: modelId, tools: [{ googleSearch: {} }] });
  const pubDate = new Date().toISOString();

  const styleGuides = {
    info: `1. 제목 - 클릭을 부르는 매력적인 블로그 글 제목 1개를 작성한다. 과장·낚시 금지.
    2. 서론 - 3~5문단, 이 글에서 다룰 내용, 왜 중요한지, 읽었을 때 이득을 소개.
    3. 본문 - 소제목(H2) 3~5개, 각 소제목 아래 구체적 설명 3~6문단.
    4. 결론 - 핵심 2~4문장 + 실천 항목 2~3개 bullet 리스트.
    5. Q&A - 관련 질문과 답변.`,
    ranking: `1. 제목 - "TOP N ..." 형식의 제목 1개. 순위가 명확히 드러나게.
    2. 서론 - 2~3문단, 이 순위를 소개하는 이유와 선정 기준 설명.
    3. 본문 - 순위별(1위~N위) 각 항목을 H2로 구성, 각 순위마다 특징·장점·추천 이유 2~4문단.
    4. 결론 - 전체 순위 요약 + 독자에게 맞는 선택 가이드 1~2문장.
    5. Q&A - 순위 관련 자주 묻는 질문과 답변.`,
    comparison: `1. 제목 - "A vs B" 또는 "X와 Y 비교" 형식의 제목 1개.
    2. 서론 - 2~3문단, 두 대상을 비교하는 이유와 어떤 독자에게 유용한지 소개.
    3. 본문 - 비교 기준별 H2(예: 성능, 가격, 사용성 등), 각 기준 아래 두 대상의 차이를 명확히 서술. 가능하면 표(markdown table) 활용.
    4. 결론 - 어떤 사람에게 무엇이 더 적합한지 추천 정리.
    5. Q&A - 비교 관련 자주 묻는 질문과 답변.`,
    checklist: `1. 제목 - "체크리스트", "단계별", "하기 전 확인사항" 등이 드러나는 제목 1개.
    2. 서론 - 2~3문단, 이 체크리스트가 필요한 이유와 활용법 안내.
    3. 본문 - H2 섹션 3~5개, 각 섹션에 체크리스트 항목(- [ ] 형식) 또는 단계(Step N) 목록으로 구성. 각 항목에 간단한 설명 1~2문장.
    4. 결론 - 체크리스트 완료 후 기대 효과 + 핵심 포인트 요약.
    5. Q&A - 관련 질문과 답변.`,
  };
  const styleDescriptions = {
    info: "초보자도 이해할 수 있는 정보형/튜토리얼 글",
    ranking: "TOP N 순위 형식의 랭킹 글",
    comparison: "두 대상을 비교하는 비교형 글",
    checklist: "단계별 체크리스트 형식의 글",
  };
  const styleGuide = styleGuides[writingStyle] || styleGuides.info;
  const styleDesc = styleDescriptions[writingStyle] || styleDescriptions.info;

  const affiliateSection = affiliateLinks.length > 0 ? `
    [제휴 링크 삽입 가이드 - 필수]
    - 다음 제품들에 대한 제휴 링크가 있습니다: ${affiliateLinks.map(l => l.name).join(', ')}
    - 본문에서 해당 제품이 자연스럽게 언급될 수 있는 위치에 [AFFILIATE: 제품명] 플레이스홀더를 삽입하세요.
    - 제품명은 정확히 위 목록에 있는 이름을 사용하세요.` : '';

  const prompt = `
    [목표]
    구글 애드센스 승인을 통과할 수 있을 만큼 품질이 좋은 블로그 글을 작성한다.
    주제는 "${topic}"이며, ${styleDesc}로 쓴다.

    [타깃 독자]
    이 주제에 관심이 있는 한국 독자. 처음 접하는 사람도 이해할 수 있도록 쉽게 설명한다.

    [글의 목적]
    이 글을 읽은 독자가 "${topic}"에 대해 핵심을 파악하고 실제로 활용할 수 있도록 돕는다.

    [구성 요구사항]
    ${styleGuide}

    [톤 & 스타일]
    - 존댓말, 블로그 글체, 친절하지만 과장되지 않게 작성한다.
    - 문장은 가능한 한 짧고 명확하게 쓴다.
    - 개인의 경험이나 의견, 생각을 반드시 글에 넣어서 작성한다.
    - 글자수는 2000자에서 3000자 사이로 작성한다. (중요)

    [주의]
    - 국내(한국) 사용자가 읽는다는 전제로, 한국 서비스·상황을 우선으로 설명한다.
    - 절대 다른 블로그 글 구조나 표현을 그대로 모방하지 말고, 새로운 흐름으로 설명한다.
    - 도입부 이후 본문에서는 "닥터노마드", "Dr. Nomad" 등 필자의 닉네임/블로그명을 절대 사용하지 않는다.
${affiliateSection}

${affiliateLinks.some(l => l.url && l.url.includes('coupang.com')) ? `    [이미지 안내]
    - 본문에 [UNSPLASH: ...] 이미지 태그를 넣지 마세요. 상품 이미지가 별도로 삽입됩니다.` : `    [이미지 구성 가이드 - 필수]
    - 본문 소제목 H2 아래에 반드시 총 3개의 이미지 자리를 다음 형식으로 정확히 표기하세요:
      [UNSPLASH: 이미지_검색_키워드]
    - 썸네일은 자동으로 삽입되므로 본문에는 [UNSPLASH: ...] 태그만 3개 넣으세요.
    - 검색 키워드는 영어로 작성하는 것이 Unsplash 검색 결과가 더 좋습니다.`}

    [출력 형식]
    - 반드시 마크다운(Markdown) 형식으로 출력한다.
    - 제목은 H1(#), 소제목은 H2(##), 필요하면 소소제목은 H3(###)로 작성한다.
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

    반드시 마크다운 내용만 반환하고, 앞뒤에 불필요한 설명은 넣지 마세요.
  `;

  try {
    const result = await aiModel.generateContent(prompt);
    const response = await result.response;
    let text = response.text().trim();

    // 제휴링크 플레이스홀더 치환
    if (affiliateLinks.length > 0) {
      for (const { name, url, imgUrl } of affiliateLinks) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const placeholder = new RegExp(`\\[AFFILIATE:\\s*${escaped}\\]`, 'gi');
        const imgMd = imgUrl ? `\n\n[![${name}](${imgUrl})](${url})\n` : '';
        const linkMd = `${imgMd}\n\n> **[${name} 구매하기 →](${url})**\n`;
        text = text.replace(placeholder, linkMd);
      }
      const hasCoupang = affiliateLinks.some(({ url }) => url && url.includes('coupang.com'));
      if (hasCoupang) {
        text = text.trimEnd() + '\n\n---\n\n> 이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.\n';
      }
    }

    res.json({ content: text });
  } catch (error) {
    console.error("Error generating post:", error);
    res.status(500).json({ error: "Failed to generate content: " + error.message });
  }
});

// API route to save content
app.post("/api/save", async (req, res) => {
  const { content, thumbnailImage, blog } = req.body;
  if (!content) {
    return res.status(400).json({ error: "Content is required" });
  }

  try {
    // Extract title for filename
    const titleMatch = content.match(/title:\s*(.*)/);
    const title = titleMatch ? titleMatch[1].trim().replace(/['"[\]]/g, "") : "new-post";
    // Sanitize title for filename
    const sanitizedTitle = title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-");

    const dateStr = new Date().toISOString().split("T")[0];
    const fileName = `${dateStr}-${sanitizedTitle}.md`;
    const filePath = path.join(getBlogDir(blog), fileName);

    // Create directory if not exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Fix title field: wrap in quotes if contains colon and not already quoted
    let fixedContent = content.trim().replace(
      /^(title:\s*)(.+)$/m,
      (match, prefix, value) => {
        value = value.trim();
        const isQuoted = (value.startsWith('"') && value.endsWith('"')) ||
                         (value.startsWith("'") && value.endsWith("'"));
        if (isQuoted) {
          const inner = value.slice(1, -1).replace(/\\"/g, '"');
          return `${prefix}"${inner.replace(/"/g, '\\"')}"`;
        }
        if (value.includes(':')) {
          return `${prefix}"${value.replace(/"/g, '\\"')}"`;
        }
        return match;
      }
    );

    // Process and save thumbnail if provided
    if (thumbnailImage) {
      try {
        // createCanvas, loadImage already imported at top level

        const base64Data = thumbnailImage.replace(/^data:image\/\w+;base64,/, "");
        const imgBuf = Buffer.from(base64Data, "base64");

        const img = await loadImage(imgBuf);
        const W = img.naturalWidth || img.width;
        const H = img.naturalHeight || img.height;
        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext("2d");

        // Draw background
        ctx.drawImage(img, 0, 0, W, H);

        // Title text
        const rawTitle = titleMatch ? titleMatch[1].trim().replace(/^["'\[]|["'\]]$/g, "") : "";
        const fontSize = Math.floor(W * 0.065);
        ctx.font = `bold ${fontSize}px MalgunGothic`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // Word-wrap
        const maxWidth = W * 0.72;
        const words = rawTitle.split(" ");
        const lines = [];
        let cur = "";
        for (const word of words) {
          const test = cur ? cur + " " + word : word;
          if (ctx.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = word; }
          else cur = test;
        }
        if (cur) lines.push(cur);
        if (lines.length > 3) { lines.splice(2); lines[1] += "..."; }

        const lineH = fontSize * 1.45;
        const totalH = lines.length * lineH;
        const rw = W * 0.82, rh = totalH + fontSize * 2.2;
        const rx = (W - rw) / 2, ry = (H - rh) / 2, r = 36;

        // White rounded rect
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(rx+r,ry); ctx.lineTo(rx+rw-r,ry); ctx.quadraticCurveTo(rx+rw,ry,rx+rw,ry+r);
        ctx.lineTo(rx+rw,ry+rh-r); ctx.quadraticCurveTo(rx+rw,ry+rh,rx+rw-r,ry+rh);
        ctx.lineTo(rx+r,ry+rh); ctx.quadraticCurveTo(rx,ry+rh,rx,ry+rh-r);
        ctx.lineTo(rx,ry+r); ctx.quadraticCurveTo(rx,ry,rx+r,ry); ctx.closePath();
        ctx.fillStyle = "rgba(255,255,255,0.92)"; ctx.fill(); ctx.restore();

        // Text
        ctx.fillStyle = "#111827";
        const startY = H / 2 - totalH / 2 + lineH / 2;
        lines.forEach((line, i) => ctx.fillText(line, W / 2, startY + i * lineH));

        const thumbFilename = `thumb-${Date.now()}.png`;
        const imageDir = getImageDir(blog);
        if (!fs.existsSync(imageDir)) fs.mkdirSync(imageDir, { recursive: true });
        fs.writeFileSync(path.join(imageDir, thumbFilename), canvas.toBuffer("image/png"));

        const thumbUrl = `/assets/images/${thumbFilename}`;
        const fmEnd = fixedContent.indexOf("\n---", 3);
        if (fmEnd !== -1) {
          fixedContent = fixedContent.slice(0, fmEnd) +
                         `\nogImage: ${thumbUrl}` +
                         fixedContent.slice(fmEnd);
          const bodyStart = fixedContent.indexOf("\n---", 3) + 4;
          fixedContent = fixedContent.slice(0, bodyStart) +
                         `\n![썸네일](${thumbUrl})\n\n` +
                         fixedContent.slice(bodyStart);
        }
        console.log(`Thumbnail saved: ${thumbUrl}`);
      } catch (thumbErr) {
        console.error("Thumbnail processing error:", thumbErr);
      }
    }

    fs.writeFileSync(filePath, fixedContent, { encoding: "utf8" });

    // Auto git add + commit + push
    try {
      const blogRoot = getBlogRoot(blog);
      const gitAdd = spawn("git", ["add", filePath], { cwd: blogRoot });
      await new Promise((resolve, reject) => {
        gitAdd.on("close", code => code === 0 ? resolve() : reject(new Error(`git add failed: ${code}`)));
      });

      // 이미지 폴더 전체 추가 (썸네일 + 본문 이미지 모두 포함)
      const imageDir = path.join(blogRoot, "public/assets/images");
      if (fs.existsSync(imageDir)) {
        const gitAddImg = spawn("git", ["add", imageDir], { cwd: blogRoot });
        await new Promise((resolve) => gitAddImg.on("close", resolve));
      }

      const commitMsg = `feat: add scheduled post - ${fileName}`;
      const gitCommit = spawn("git", ["commit", "-m", commitMsg], { cwd: blogRoot });
      await new Promise((resolve, reject) => {
        gitCommit.on("close", code => code === 0 ? resolve() : reject(new Error(`git commit failed: ${code}`)));
      });

      const gitPush = spawn("git", ["push"], { cwd: blogRoot });
      await new Promise((resolve, reject) => {
        gitPush.on("close", code => code === 0 ? resolve() : reject(new Error(`git push failed: ${code}`)));
      });

      console.log(`Git push completed for: ${fileName}`);
      res.json({ message: "Post saved and pushed successfully", fileName });
    } catch (gitError) {
      console.error("Git push error:", gitError);
      res.json({ message: "Post saved successfully (git push failed)", fileName, gitError: gitError.message });
    }
  } catch (error) {
    console.error("Error saving post:", error);
    res.status(500).json({ error: "Failed to save post: " + error.message });
  }
});

// API route to get a specific post content
app.get("/api/posts/:fileName", (req, res) => {
  const { fileName } = req.params;
  const { blog } = req.query;
  const filePath = path.join(getBlogDir(blog), fileName);
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
  const { blog } = req.query;
  const filePath = path.join(getBlogDir(blog), fileName);

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
  const { blog } = req.query;
  const blogDir = getBlogDir(blog);
  try {
    if (!fs.existsSync(blogDir)) {
      return res.json({ total: 0, drafts: 0, scheduled: 0, published: 0 });
    }
    const files = fs.readdirSync(blogDir).filter(f => f.endsWith(".md"));
    const now = new Date();
    let drafts = 0, scheduled = 0, published = 0;
    files.forEach(f => {
      const content = fs.readFileSync(path.join(blogDir, f), "utf8");
      const draftMatch = content.match(/draft:\s*(true|false)/);
      const pubMatch = content.match(/pubDatetime:\s*(.*)/);
      const isDraft = draftMatch ? draftMatch[1] === "true" : false;
      const pubDatetime = pubMatch ? new Date(pubMatch[1].trim()) : null;
      if (isDraft) {
        drafts++;
      } else if (pubDatetime && pubDatetime > now) {
        scheduled++;
      } else {
        published++;
      }
    });
    res.json({ total: files.length, drafts, scheduled, published });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API route to list posts
app.get("/api/posts", (req, res) => {
  const { blog } = req.query;
  const blogDir = getBlogDir(blog);
  try {
    if (!fs.existsSync(blogDir)) return res.json({ posts: [] });
    const now = new Date();
    const files = fs.readdirSync(blogDir)
      .filter(f => f.endsWith(".md"))
      .map(f => {
        const filePath = path.join(blogDir, f);
        const stats = fs.statSync(filePath);
        const content = fs.readFileSync(filePath, "utf8");
        const draftMatch = content.match(/draft:\s*(true|false)/);
        const pubMatch = content.match(/pubDatetime:\s*(.*)/);
        const titleMatch = content.match(/^title:\s*["']?(.+?)["']?$/m);
        const isDraft = draftMatch ? draftMatch[1] === "true" : false;
        const pubDatetime = pubMatch ? pubMatch[1].trim() : null;
        // 상태 판정:
        // draft: true → 임시저장
        // draft: false + 미래 pubDatetime → 예약됨 (Cloudflare 빌드 시 노출)
        // draft: false + 과거/현재 pubDatetime → 발행됨
        let status;
        if (isDraft) {
          status = "draft";
        } else if (pubDatetime && new Date(pubDatetime) > now) {
          status = "scheduled";
        } else {
          status = "published";
        }
        return {
          fileName: f,
          title: titleMatch ? titleMatch[1].trim() : f,
          mtime: stats.mtime,
          draft: isDraft,
          pubDatetime,
          status
        };
      })
      .sort((a, b) => new Date(b.pubDatetime || b.mtime) - new Date(a.pubDatetime || a.mtime));
    res.json({ posts: files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API route to get post content
app.get("/api/post-content", (req, res) => {
  const { file, blog } = req.query;
  if (!file) {
    return res.status(400).json({ error: "File name is required" });
  }

  const blogDir = getBlogDir(blog);
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

// API route to list categories with post counts
app.get("/api/categories", (req, res) => {
  const { blog } = req.query;
  const blogDir = getBlogDir(blog);
  const categoriesDir = path.join(blogDir, ".categories");
  try {
    const categoryCounts = { "General": 0 };

    // Load categories from marker files
    if (fs.existsSync(categoriesDir)) {
      const markerFiles = fs.readdirSync(categoriesDir).filter(f => f.endsWith(".txt"));
      markerFiles.forEach(f => {
        const categoryName = f.replace(".txt", "").trim();
        if (!categoryCounts[categoryName]) {
          categoryCounts[categoryName] = 0;
        }
      });
    }

    // Also scan existing posts for categories and count them
    if (fs.existsSync(blogDir)) {
      const files = fs.readdirSync(blogDir).filter(f => f.endsWith(".md"));
      files.forEach(f => {
        const content = fs.readFileSync(path.join(blogDir, f), "utf8");
        const match = content.match(/category:\s*["']?(.*?)["']?[\r\n]/);
        if (match && match[1]) {
          const cat = match[1].trim();
          categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
        } else {
          // If no category tag found, count as General
          categoryCounts["General"]++;
        }
      });
    }

    const categories = Object.keys(categoryCounts).sort();
    res.json({ categories, categoryCounts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API route to add category (create a marker file)
app.post("/api/categories", (req, res) => {
  const { category, blog } = req.body;
  if (!category || category.trim() === "") {
    return res.status(400).json({ error: "카테고리 이름이 필요합니다." });
  }

  const blogDir = getBlogDir(blog);
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
  const { category, blog } = req.body;
  if (!category || category.trim() === "") {
    return res.status(400).json({ error: "카테고리 이름이 필요합니다." });
  }

  if (category === "General") {
    return res.status(400).json({ error: "기본 카테고리는 삭제할 수 없습니다." });
  }

  const blogDir = getBlogDir(blog);
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
  const { oldName, newName, blog } = req.body;
  if (!oldName || !newName || oldName.trim() === "" || newName.trim() === "") {
    return res.status(400).json({ error: "이전 이름과 새 이름이 모두 필요합니다." });
  }

  if (oldName === "General") {
    return res.status(400).json({ error: "기본 카테고리는 이름을 변경할 수 없습니다." });
  }

  const blogDir = getBlogDir(blog);
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
  const { apiKey, unsplashKey, naverAdKey, naverAdSecret, naverAdCustomer, naverClientId, naverClientSecret } = req.body;

  try {
    let envPath = path.join(process.cwd(), ".env");
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";

    const setEnvVar = (content, varName, value) => {
      if (!value || value.trim() === "" || value.includes("...")) return content;
      const trimmed = value.trim();
      if (content.includes(`${varName}=`)) {
        return content.replace(new RegExp(`${varName}=.*`), `${varName}=${trimmed}`);
      }
      return content + `\n${varName}=${trimmed}`;
    };

    if (apiKey && apiKey.trim() !== "" && !apiKey.includes("...")) {
      currentApiKey = apiKey.trim();
      genAI = new GoogleGenerativeAI(currentApiKey);
    }
    if (unsplashKey && unsplashKey.trim() !== "" && !unsplashKey.includes("...")) {
      currentUnsplashKey = unsplashKey.trim();
    }

    envContent = setEnvVar(envContent, "GEMINI_API_KEY", apiKey);
    envContent = setEnvVar(envContent, "UNSPLASH_ACCESS_KEY", unsplashKey);
    envContent = setEnvVar(envContent, "NAVER_AD_API_KEY", naverAdKey);
    envContent = setEnvVar(envContent, "NAVER_AD_SECRET", naverAdSecret);
    envContent = setEnvVar(envContent, "NAVER_AD_CUSTOMER_ID", naverAdCustomer);
    envContent = setEnvVar(envContent, "NAVER_CLIENT_ID", naverClientId);
    envContent = setEnvVar(envContent, "NAVER_CLIENT_SECRET", naverClientSecret);

    fs.writeFileSync(envPath, envContent.trim() + "\n");

    // 네이버 키는 process.env에도 즉시 반영 (재시작 없이 사용 가능)
    if (naverAdKey && !naverAdKey.includes("...")) process.env.NAVER_AD_API_KEY = naverAdKey.trim();
    if (naverAdSecret && !naverAdSecret.includes("...")) process.env.NAVER_AD_SECRET = naverAdSecret.trim();
    if (naverAdCustomer && !naverAdCustomer.includes("...")) process.env.NAVER_AD_CUSTOMER_ID = naverAdCustomer.trim();
    if (naverClientId && !naverClientId.includes("...")) process.env.NAVER_CLIENT_ID = naverClientId.trim();
    if (naverClientSecret && !naverClientSecret.includes("...")) process.env.NAVER_CLIENT_SECRET = naverClientSecret.trim();

    res.json({ message: "설정이 성공적으로 업데이트되었습니다." });
  } catch (err) {
    res.status(500).json({ error: "설정 업데이트 실패: " + err.message });
  }
});

// API route to search Unsplash and download image locally
app.get("/api/unsplash-search", async (req, res) => {
  const { query, blog } = req.query;
  if (!currentUnsplashKey) {
    return res.status(400).json({ error: "Unsplash API 키가 설정되지 않았습니다." });
  }

  try {
    const response = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&client_id=${currentUnsplashKey}`);
    const data = await response.json();
    if (data.results && data.results.length > 0) {
      const imageUrl = data.results[0].urls.regular;

      // Download and save image locally
      const imgResponse = await fetch(imageUrl);
      const buffer = Buffer.from(await imgResponse.arrayBuffer());
      const filename = `unsplash-${Date.now()}.jpg`;
      const imageDir = getImageDir(blog);
      const imagePath = path.join(imageDir, filename);

      if (!fs.existsSync(imageDir)) {
        fs.mkdirSync(imageDir, { recursive: true });
      }

      fs.writeFileSync(imagePath, buffer);
      res.json({ url: `/assets/images/${filename}` });
    } else {
      res.json({ url: null });
    }
  } catch (err) {
    console.error("Unsplash error:", err);
    res.status(500).json({ error: "Unsplash 검색 실패: " + err.message });
  }
});

// API route to upload a pre-composited thumbnail (base64 PNG)
app.post("/api/process-thumbnail", async (req, res) => {
  const { image, blog } = req.body;
  if (!image) return res.status(400).json({ error: "이미지가 필요합니다." });
  try {
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const filename = `thumb-${Date.now()}.png`;
    const imageDir = getImageDir(blog);
    if (!fs.existsSync(imageDir)) fs.mkdirSync(imageDir, { recursive: true });
    fs.writeFileSync(path.join(imageDir, filename), Buffer.from(base64Data, "base64"));
    console.log(`Thumbnail saved: ${filename}`);
    res.json({ url: `/assets/images/${filename}` });
  } catch (err) {
    console.error("Thumbnail upload error:", err);
    res.status(500).json({ error: "썸네일 저장 실패: " + err.message });
  }
});

// API route to convert markdown to SNS formats
app.post("/api/sns/convert", async (req, res) => {
  const { markdown } = req.body;
  if (!markdown || !markdown.trim()) {
    return res.status(400).json({ error: "콘텐츠가 없습니다." });
  }

  // --- Helper: strip frontmatter and extract fields ---
  const fmMatch = markdown.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  let body = markdown;
  let title = "";
  let description = "";
  if (fmMatch) {
    const fm = fmMatch[1];
    body = fmMatch[2].trim();
    const titleM = fm.match(/^title:\s*["']?(.+?)["']?\s*$/m);
    const descM = fm.match(/^description:\s*["']?(.+?)["']?\s*$/m);
    title = titleM ? titleM[1].trim() : "";
    description = descM ? descM[1].trim() : "";
  }

  // ── NAVER BLOG: AI로 네이버 블로그 스타일 재작성 ──
  async function convertToNaver(originalTitle, originalBody) {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `
다음은 구글 블로그용으로 작성된 글입니다. 이 글의 핵심 내용을 바탕으로 네이버 블로그 스타일로 완전히 새롭게 작성해주세요.

[원본 제목]
${originalTitle}

[원본 본문]
${originalBody}

[네이버 블로그 변환 지침 - 반드시 준수]
1. 제목: "메인 키워드, 클릭을 유도하는 짧은 문구" 형식으로 작성
   예시: "주거급여 입금일, 이 글만 보세요" / "청년도약계좌 조건, 딱 3분이면 정리됩니다"
2. 글자수: 반드시 1000자 이하
3. 실제 사람이 쓴 것처럼 생동감 있는 구어체 사용 (예: "솔직히", "근데 막상 해보니", "저도 처음엔")
4. 메인 키워드는 글 초반에 정확히 3번만 사용하고, 이후에는 절대 반복하지 말 것
5. 글 앞부분에서 독자가 이 글을 읽으면 문제가 해결된다는 것을 명확히 밝히거나 전체 내용을 간단히 요약
6. 모든 정보를 다 주지 말고, 독자가 더 알고 싶어지도록 일부는 링크 유도로 마무리
7. 글 마지막에 더 자세한 정보를 원하는 독자를 링크로 유도하는 문장 포함 (링크 자리는 [링크]로 표기)
8. 존댓말 사용, 반말 금지
9. 마크다운 형식으로 출력 (제목은 ## 사용)

[출력 형식]
- 첫 줄: 변환된 제목 (## 제목)
- 이후: 본문 내용
- 마크다운만 반환, 앞뒤 설명 없이
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    // 제목과 본문 분리
    const lines = text.split("\n");
    const titleLine = lines.find(l => l.startsWith("## ") || l.startsWith("# "));
    const naverTitle = titleLine ? titleLine.replace(/^#{1,2} /, "").trim() : originalTitle;
    const naverBody = lines.filter(l => l !== titleLine).join("\n").trim();

    return { title: naverTitle, htmlContent: naverBody };
  }

  // ── THREADS: markdown → SNS-style single post (≤300 chars) + link nudge ──
  function convertToThreadsPosts(md, postTitle, postDesc) {
    let text = md;
    // Remove images and UNSPLASH tags
    text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "");
    text = text.replace(/\[UNSPLASH:[^\]]*\]/g, "");
    // Strip headings (extract text only)
    text = text.replace(/^#{1,6} (.+)$/gm, "$1");
    // Bold/italic → plain
    text = text.replace(/\*\*\*(.+?)\*\*\*/g, "$1");
    text = text.replace(/\*\*(.+?)\*\*/g, "$1");
    text = text.replace(/\*(.+?)\*/g, "$1");
    // Links → text only
    text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    // Inline code → plain
    text = text.replace(/`([^`]+)`/g, "$1");
    // List items
    text = text.replace(/^[-*] (.+)$/gm, "• $1");
    text = text.replace(/^\d+\. (.+)$/gm, "• $1");
    // Collapse blank lines
    text = text.replace(/\n{3,}/g, "\n\n").trim();

    // Extract keyword from title (첫 쉼표 앞 또는 전체 제목)
    const keyword = postTitle.includes(",") ? postTitle.split(",")[0].trim() : postTitle;

    // Build a concise summary (≤200 chars) from description or first paragraph
    const firstPara = text.split(/\n\n+/).map(p => p.trim()).find(p => p.length > 20) || "";
    let summary = postDesc || firstPara;
    // Ensure keyword appears exactly once near the start
    if (summary && !summary.includes(keyword)) {
      summary = `${keyword} 관련하여 — ${summary}`;
    }
    // Trim summary to fit within 200 chars
    if (summary.length > 200) {
      const cut = summary.slice(0, 200);
      const lastPunct = Math.max(cut.lastIndexOf("。"), cut.lastIndexOf("."), cut.lastIndexOf("!"), cut.lastIndexOf("?"));
      summary = lastPunct > 80 ? cut.slice(0, lastPunct + 1) : cut.trimEnd() + "...";
    }

    // Link nudge line (always present)
    const nudge = "더 자세한 정보가 궁금하다면? 아래 댓글 참고 👇";

    // Compose single post
    const post = `${summary}\n\n${nudge}`;

    return [post];
  }

  try {
    const naverResult = await convertToNaver(title, body);
    const threadsPosts = convertToThreadsPosts(body, title, description);

    res.json({
      naver: naverResult,
      threads: { posts: threadsPosts }
    });
  } catch (err) {
    res.status(500).json({ error: "변환 오류: " + err.message });
  }
});

// API route to publish existing draft
app.post("/api/publish", async (req, res) => {
  const { fileName, blog } = req.body;
  if (!fileName) return res.status(400).json({ error: "Filename is required" });

  const blogDir = getBlogDir(blog);
  const blogRoot = getBlogRoot(blog);
  const filePath = path.join(blogDir, fileName);

  try {
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "파일을 찾을 수 없습니다." });
    }

    let content = fs.readFileSync(filePath, "utf8");
    content = content.replace(/draft:\s*true/, "draft: false");
    fs.writeFileSync(filePath, content, { encoding: "utf8" });

    // git add, commit, push 자동 실행 (블로그 루트 기준)
    const titleMatch = content.match(/^title:\s*["']?(.+?)["']?$/m);
    const title = titleMatch ? titleMatch[1].trim() : fileName;
    const { execSync } = await import("child_process");
    try {
      execSync(`git add "${filePath}"`, { cwd: blogRoot });
      // 이미지 파일도 함께 스테이징
      const imageDir = path.join(blogRoot, "public/assets/images");
      if (fs.existsSync(imageDir)) {
        execSync(`git add "${imageDir}"`, { cwd: blogRoot });
      }
      execSync(`git commit -m "publish: ${title}"`, { cwd: blogRoot });
      execSync("git push", { cwd: blogRoot });
      res.json({ message: "게시물이 발행되고 GitHub에 push되었습니다." });
    } catch (gitErr) {
      res.json({ message: "게시물이 발행되었습니다. (git push 실패: " + gitErr.message + ")" });
    }
  } catch (err) {
    res.status(500).json({ error: "발행 중 오류 발생: " + err.message });
  }
});

// ── 대량 글쓰기 (서버 사이드) ──
const bulkJobs = new Map();

app.post("/api/bulk-generate", (req, res) => {
  const { keywords, category = "General", model: modelId = "gemini-3-flash-preview", blog, mode = "draft", scheduleStart, scheduleInterval = 30, thumbnailImage, writingStyle = "info", keywordAffiliateMap = {}, imageMode = "unsplash" } = req.body;

  if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
    return res.status(400).json({ error: "키워드가 필요합니다." });
  }
  if (keywords.length > 10) {
    return res.status(400).json({ error: "최대 10개까지 가능합니다." });
  }

  const jobId = `bulk-${Date.now()}`;
  const job = {
    id: jobId,
    total: keywords.length,
    completed: 0,
    successes: 0,
    failures: 0,
    items: keywords.map(kw => ({ keyword: kw, status: "pending", message: "" })),
    done: false,
  };
  bulkJobs.set(jobId, job);

  // Run in background (non-blocking)
  (async () => {
    for (let i = 0; i < keywords.length; i++) {
      const kw = keywords[i];
      job.items[i].status = "generating";

      try {
        // 1. Calculate pubDate
        let pubDate;
        if (mode === "schedule" && scheduleStart) {
          pubDate = new Date(new Date(scheduleStart).getTime() + i * scheduleInterval * 60000).toISOString();
        } else {
          pubDate = new Date(Date.now() + i * 1000).toISOString();
        }

        // 2. Generate via Gemini
        const aiModel = genAI.getGenerativeModel({ model: modelId, tools: [{ googleSearch: {} }] });

        const styleGuides = {
          info: `1. 제목 - 클릭을 부르는 매력적인 블로그 글 제목 1개를 작성한다. 과장·낚시 금지.
    2. 서론 - 3~5문단, 이 글에서 다룰 내용, 왜 중요한지, 읽었을 때 이득을 소개.
    3. 본문 - 소제목(H2) 3~5개, 각 소제목 아래 구체적 설명 3~6문단.
    4. 결론 - 핵심 2~4문장 + 실천 항목 2~3개 bullet 리스트.
    5. Q&A - 관련 질문과 답변.`,
          ranking: `1. 제목 - "TOP N ..." 형식의 제목 1개. 순위가 명확히 드러나게.
    2. 서론 - 2~3문단, 이 순위를 소개하는 이유와 선정 기준 설명.
    3. 본문 - 순위별(1위~N위) 각 항목을 H2로 구성, 각 순위마다 특징·장점·추천 이유 2~4문단.
    4. 결론 - 전체 순위 요약 + 독자에게 맞는 선택 가이드 1~2문장.
    5. Q&A - 순위 관련 자주 묻는 질문과 답변.`,
          comparison: `1. 제목 - "A vs B" 또는 "X와 Y 비교" 형식의 제목 1개.
    2. 서론 - 2~3문단, 두 대상을 비교하는 이유와 어떤 독자에게 유용한지 소개.
    3. 본문 - 비교 기준별 H2(예: 성능, 가격, 사용성 등), 각 기준 아래 두 대상의 차이를 명확히 서술. 가능하면 표(markdown table) 활용.
    4. 결론 - 어떤 사람에게 무엇이 더 적합한지 추천 정리.
    5. Q&A - 비교 관련 자주 묻는 질문과 답변.`,
          checklist: `1. 제목 - "체크리스트", "단계별", "하기 전 확인사항" 등이 드러나는 제목 1개.
    2. 서론 - 2~3문단, 이 체크리스트가 필요한 이유와 활용법 안내.
    3. 본문 - H2 섹션 3~5개, 각 섹션에 체크리스트 항목(- [ ] 형식) 또는 단계(Step N) 목록으로 구성. 각 항목에 간단한 설명 1~2문장.
    4. 결론 - 체크리스트 완료 후 기대 효과 + 핵심 포인트 요약.
    5. Q&A - 관련 질문과 답변.`,
        };
        const styleGuide = styleGuides[writingStyle] || styleGuides.info;

        const styleDescriptions = {
          info: "초보자도 이해할 수 있는 정보형/튜토리얼 글",
          ranking: "TOP N 순위 형식의 랭킹 글",
          comparison: "두 대상을 비교하는 비교형 글",
          checklist: "단계별 체크리스트 형식의 글",
        };
        const styleDesc = styleDescriptions[writingStyle] || styleDescriptions.info;

        const prompt = `
    [목표]
    구글 애드센스 승인을 통과할 수 있을 만큼 품질이 좋은 블로그 글을 작성한다.
    주제는 "${kw}"이며, ${styleDesc}로 쓴다.

    [타깃 독자]
    이 주제에 관심이 있는 한국 독자. 처음 접하는 사람도 이해할 수 있도록 쉽게 설명한다.

    [글의 목적]
    이 글을 읽은 독자가 "${kw}"에 대해 핵심을 파악하고 실제로 활용할 수 있도록 돕는다.

    [구성 요구사항]
    ${styleGuide}

    [톤 & 스타일]
    - 존댓말, 블로그 글체. 문장은 짧고 명확하게.
    - 개인 경험이나 의견을 넣어서 작성. 글자수 2000~3000자.

${(keywordAffiliateMap[kw] || []).some(l => l.url && l.url.includes('coupang.com')) ? `    [이미지 안내]
    - 본문에 [UNSPLASH: ...] 이미지 태그를 넣지 마세요. 상품 이미지가 별도로 삽입됩니다.` : `    [이미지 구성 가이드 - 필수]
    - 본문 소제목 H2 아래에 총 3개의 이미지 자리를 [UNSPLASH: 영어_키워드] 형식으로 표기.`}
${(keywordAffiliateMap[kw] || []).length > 0 ? `
    [제휴 링크 삽입 가이드 - 필수]
    - 다음 제품들에 대한 제휴 링크가 있습니다: ${(keywordAffiliateMap[kw] || []).map(l => l.name).join(', ')}
    - 본문에서 해당 제품이 자연스럽게 언급될 수 있는 위치에 [AFFILIATE: 제품명] 플레이스홀더를 삽입하세요.
    - 랭킹형: 각 순위 항목 설명 끝에 삽입
    - 비교형: 각 비교 대상 설명 끝에 삽입
    - 체크리스트형: 해당 항목 끝에 삽입
    - 정보 제공형: 해당 제품 언급 직후 또는 결론 직전에 삽입
    - 제품명은 정확히 위 목록에 있는 이름을 사용하세요.` : ''}

    [출력 형식]
    - 마크다운 형식. 제목 H1(#), 소제목 H2(##).
    - Frontmatter 포함:

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
    description: [짧은 요약]
    ---

    마크다운 내용만 반환하세요.
  `;

        const result = await aiModel.generateContent(prompt);
        const response = await result.response;
        let content = response.text().trim();

        // AI가 frontmatter 앞에 설명 텍스트를 출력한 경우 제거
        const frontmatterStart = content.indexOf("---");
        if (frontmatterStart > 0) content = content.slice(frontmatterStart);

        // Set pubDatetime
        content = content.replace(/pubDatetime:\s*.*?\n/, `pubDatetime: ${pubDate}\n`);
        content = content.replace(/ogImage:\s*.*?\n/, "");
        content = content.replace(/!\[Thumbnail\]\(.*?\)\n\n/, "");

        // 2-1. Replace affiliate placeholders with actual links
        const kwAffiliateLinks = keywordAffiliateMap[kw] || [];
        if (kwAffiliateLinks.length > 0) {
          for (const { name, url } of kwAffiliateLinks) {
            const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const placeholder = new RegExp(`\\[AFFILIATE:\\s*${escaped}\\]`, 'gi');
            const imgMd = (kwAffiliateLinks.find(l => l.name === name)?.imgUrl) ? `\n\n[![${name}](${kwAffiliateLinks.find(l => l.name === name).imgUrl})](${url})\n` : '';
            const linkMd = `${imgMd}\n\n> **[${name} 구매하기 →](${url})**\n`;
            content = content.replace(placeholder, linkMd);
          }
          // 공시 문구 — 쿠팡 링크일 때만 삽입
          const hasCoupang = kwAffiliateLinks.some(({ url }) => url && url.includes('coupang.com'));
          if (hasCoupang) {
            content = content.trimEnd() + '\n\n---\n\n> 이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.\n';
          }
        }

        // 3. Images (Unsplash or SerpAPI)
        job.items[i].status = "images";
        let unsplashMatches = content.match(/\[UNSPLASH:\s*(.*?)\]/g) || [];

        if (unsplashMatches.length < 3) {
          const h2Regex = /^##\s+(.*)$/gm;
          let m; let cnt = unsplashMatches.length;
          while ((m = h2Regex.exec(content)) !== null && cnt < 3) {
            const insertPos = m.index + m[0].length;
            content = content.slice(0, insertPos) + `\n[UNSPLASH: ${m[1]}]\n` + content.slice(insertPos);
            cnt++;
          }
          unsplashMatches = content.match(/\[UNSPLASH:\s*(.*?)\]/g) || [];
        }

        if (imageMode === "serp") {
          const serpApiKey = process.env.SERPAPI_KEY;
          if (serpApiKey) {
            for (const um of unsplashMatches) {
              const km = um.match(/\[UNSPLASH:\s*(.*?)\]/);
              if (!km) continue;
              try {
                const serpQuery = `${kw} ${km[1]}`.trim();
                const serpUrl = `https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(serpQuery)}&hl=ko&gl=kr&num=8&api_key=${serpApiKey}`;
                const serpRes = await fetch(serpUrl);
                if (!serpRes.ok) { content = content.replace(um, ""); continue; }
                const serpData = await serpRes.json();
                const candidates = (serpData.images_results || []).slice(0, 8);
                let replaced = false;
                for (const img of candidates) {
                  if (!img.original) continue;
                  try {
                    const imgRes = await fetch(img.original, { signal: AbortSignal.timeout(8000) });
                    if (!imgRes.ok) continue;
                    const ct = imgRes.headers.get("content-type") || "";
                    if (!ct.startsWith("image/")) continue;
                    const ext = ct.includes("png") ? "png" : "jpg";
                    const buf = Buffer.from(await imgRes.arrayBuffer());
                    const filename = `serp-${Date.now()}.${ext}`;
                    const imageDir = getImageDir(blog);
                    if (!fs.existsSync(imageDir)) fs.mkdirSync(imageDir, { recursive: true });
                    fs.writeFileSync(path.join(imageDir, filename), buf);
                    content = content.replace(um, `\n\n![${km[1]}](/assets/images/${filename})\n\n`);
                    replaced = true;
                    break;
                  } catch { continue; }
                }
                if (!replaced) content = content.replace(um, "");
              } catch { content = content.replace(um, ""); }
            }
          } else {
            for (const um of unsplashMatches) content = content.replace(um, "");
          }
        } else {
          if (currentUnsplashKey) {
            for (const um of unsplashMatches) {
              const km = um.match(/\[UNSPLASH:\s*(.*?)\]/);
              if (!km) continue;
              try {
                const unsplashQuery = `${kw} ${km[1]}`.trim();
                const imgRes = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(unsplashQuery)}&per_page=1&client_id=${currentUnsplashKey}`);
                const imgJson = await imgRes.json();
                if (imgJson.results && imgJson.results.length > 0) {
                  const imgUrl = imgJson.results[0].urls.regular;
                  const imgBuf = Buffer.from(await (await fetch(imgUrl)).arrayBuffer());
                  const filename = `unsplash-${Date.now()}.jpg`;
                  const imageDir = getImageDir(blog);
                  if (!fs.existsSync(imageDir)) fs.mkdirSync(imageDir, { recursive: true });
                  fs.writeFileSync(path.join(imageDir, filename), imgBuf);
                  content = content.replace(um, `\n\n![${km[1]}](/assets/images/${filename})\n\n`);
                } else {
                  content = content.replace(um, "");
                }
              } catch { content = content.replace(um, ""); }
            }
          } else {
            for (const um of unsplashMatches) content = content.replace(um, "");
          }
        }

        // 4. Draft status
        if (mode === "draft") {
          if (!content.includes("draft:")) {
            content = content.replace(/^---\n/, "---\ndraft: true\n");
          } else {
            content = content.replace(/draft:\s*false/, "draft: true");
          }
        } else {
          content = content.replace(/draft:\s*true/, "draft: false");
        }

        // 5. Thumbnail (server-side composition)
        job.items[i].status = "saving";
        let fixedContent = content.trim().replace(
          /^(title:\s*)(.+)$/m,
          (match, prefix, value) => {
            value = value.trim();
            const isQuoted = (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"));
            if (isQuoted) {
              const inner = value.slice(1, -1).replace(/\\"/g, '"');
              return `${prefix}"${inner.replace(/"/g, '\\"')}"`;
            }
            if (value.includes(":")) return `${prefix}"${value.replace(/"/g, '\\"')}"`;
            return match;
          }
        );

        if (thumbnailImage) {
          try {
            const base64Data = thumbnailImage.replace(/^data:image\/\w+;base64,/, "");
            const imgBuf = Buffer.from(base64Data, "base64");
            const img = await loadImage(imgBuf);
            const W = img.naturalWidth || img.width;
            const H = img.naturalHeight || img.height;
            const canvas = createCanvas(W, H);
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, W, H);

            const titleMatch = fixedContent.match(/title:\s*["'\[]?(.*?)["'\]]?\s*[\r\n]/);
            const rawTitle = titleMatch ? titleMatch[1].trim().replace(/^["'\[]|["'\]]$/g, "") : kw;
            const fontSize = Math.floor(W * 0.065);
            ctx.font = `bold ${fontSize}px MalgunGothic`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            const maxWidth = W * 0.72;
            const words = rawTitle.split(" ");
            const lines = [];
            let cur = "";
            for (const word of words) {
              const test = cur ? cur + " " + word : word;
              if (ctx.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = word; }
              else cur = test;
            }
            if (cur) lines.push(cur);
            if (lines.length > 3) { lines.splice(2); lines[1] += "..."; }

            const lineH = fontSize * 1.45;
            const totalH = lines.length * lineH;
            const rw = W * 0.82, rh = totalH + fontSize * 2.2;
            const rx = (W - rw) / 2, ry = (H - rh) / 2, r = 36;

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(rx+r,ry); ctx.lineTo(rx+rw-r,ry); ctx.quadraticCurveTo(rx+rw,ry,rx+rw,ry+r);
            ctx.lineTo(rx+rw,ry+rh-r); ctx.quadraticCurveTo(rx+rw,ry+rh,rx+rw-r,ry+rh);
            ctx.lineTo(rx+r,ry+rh); ctx.quadraticCurveTo(rx,ry+rh,rx,ry+rh-r);
            ctx.lineTo(rx,ry+r); ctx.quadraticCurveTo(rx,ry,rx+r,ry); ctx.closePath();
            ctx.fillStyle = "rgba(255,255,255,0.92)"; ctx.fill(); ctx.restore();

            ctx.fillStyle = "#111827";
            const startY = H / 2 - totalH / 2 + lineH / 2;
            lines.forEach((line, idx) => ctx.fillText(line, W / 2, startY + idx * lineH));

            const thumbFilename = `thumb-${Date.now()}.png`;
            const imageDir = getImageDir(blog);
            if (!fs.existsSync(imageDir)) fs.mkdirSync(imageDir, { recursive: true });
            fs.writeFileSync(path.join(imageDir, thumbFilename), canvas.toBuffer("image/png"));

            const thumbUrl = `/assets/images/${thumbFilename}`;
            const fmEnd = fixedContent.indexOf("\n---", 3);
            if (fmEnd !== -1) {
              fixedContent = fixedContent.slice(0, fmEnd) + `\nogImage: ${thumbUrl}` + fixedContent.slice(fmEnd);
              const bodyStart = fixedContent.indexOf("\n---", 3) + 4;
              fixedContent = fixedContent.slice(0, bodyStart) + `\n![썸네일](${thumbUrl})\n\n` + fixedContent.slice(bodyStart);
            }
          } catch (thumbErr) {
            console.error("Bulk thumbnail error:", thumbErr);
          }
        }

        // 6. Save file
        const titleMatch = fixedContent.match(/title:\s*(.*)/);
        const title = titleMatch ? titleMatch[1].trim().replace(/['"[\]]/g, "") : "new-post";
        const sanitizedTitle = title.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");
        const dateStr = new Date().toISOString().split("T")[0];
        // 한글 제목은 sanitize 후 빈 문자열이 될 수 있으므로 키워드 인덱스로 보완
        const baseSlug = sanitizedTitle.replace(/-+/g, "-").replace(/^-|-$/g, "") || `post-${i + 1}`;
        let fileName = `${dateStr}-${baseSlug}.md`;
        // 동일 파일명 충돌 방지
        const blogDir = getBlogDir(blog);
        if (fs.existsSync(path.join(blogDir, fileName))) {
          fileName = `${dateStr}-${baseSlug}-${Date.now()}.md`;
        }
        const filePath = path.join(blogDir, fileName);

        if (!fs.existsSync(blogDir)) fs.mkdirSync(blogDir, { recursive: true });
        fs.writeFileSync(filePath, fixedContent.trim(), { encoding: "utf8" });

        // 7. Publish (git push) if not draft
        if (mode !== "draft") {
          job.items[i].status = "publishing";
          try {
            const blogRoot = getBlogRoot(blog);
            const { execSync } = await import("child_process");
            execSync(`git add "${filePath}"`, { cwd: blogRoot });
            // 이미지 폴더 전체 추가 (썸네일, 본문 이미지 모두 포함)
            const imageDir = path.join(blogRoot, "public/assets/images");
            if (fs.existsSync(imageDir)) {
              execSync(`git add "${imageDir}"`, { cwd: blogRoot });
            }
            execSync(`git commit -m "feat: add scheduled post - ${fileName}"`, { cwd: blogRoot });
            execSync("git push", { cwd: blogRoot });
          } catch (gitErr) {
            console.error("Bulk git push error:", gitErr.message);
          }
        }

        job.items[i].status = "done";
        job.items[i].message = fileName;
        job.successes++;
      } catch (err) {
        job.items[i].status = "failed";
        job.items[i].message = err.message;
        job.failures++;
      }

      job.completed++;
    }

    job.done = true;
    // Clean up after 1 hour
    setTimeout(() => bulkJobs.delete(jobId), 3600000);
  })();

  res.json({ jobId });
});

app.get("/api/bulk-status/:jobId", (req, res) => {
  const job = bulkJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json(job);
});

// Serve static files from scripts directory (after API routes)
app.use(express.static("scripts"));
// 블로그별 이미지 서빙: /assets/images/{blogKey}/... 또는 기본(weblog)은 /assets/images/...
Object.entries(BLOGS).forEach(([key, blogRoot]) => {
  app.use(`/assets/images/${key}`, express.static(path.join(blogRoot, "public/assets/images")));
});
// 기본(weblog) 이미지 경로 하위 호환 유지
app.use("/assets/images", express.static(path.join(BLOGS.weblog, "public/assets/images")));

// Serve the dashboard HTML
app.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), "scripts/dashboard.html"));
});

// Start NaverAutoResponder server (port 3110)
app.post("/api/start-jisikin", (req, res) => {
  const { path: serverPath } = req.body;
  if (!serverPath) {
    return res.status(400).json({ error: "경로가 필요합니다." });
  }

  const resolvedPath = path.resolve(serverPath);
  if (!fs.existsSync(resolvedPath)) {
    return res.status(400).json({ error: `경로를 찾을 수 없습니다: ${resolvedPath}` });
  }

  try {
    const child = spawn("npm", ["run", "start:dev"], {
      cwd: resolvedPath,
      env: { ...process.env, PORT: "3110" },
      detached: true,
      stdio: "ignore",
      shell: true,
    });
    child.unref();
    res.json({ ok: true, message: "서버 시작 요청 완료" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Cloudflare 빌드 수동 트리거 ──
// draft 필드를 변경하지 않고 Cloudflare Deploy Hook을 호출해 재빌드를 요청합니다.
// postFilter.ts가 빌드 시점의 현재 시간 기준으로 pubDatetime을 필터링하므로
// 재빌드만으로 예약된 글이 자동 노출됩니다.
app.post("/api/check-schedule", async (req, res) => {
  const blog = req.body?.blog || "weblog";
  const hookEnvMap = {
    weblog: "CF_DEPLOY_HOOK_URL",
    blog2:  "CF_DEPLOY_HOOK_URL_BLOG2",
    blog3:  "CF_DEPLOY_HOOK_URL_BLOG3",
  };
  const envKey = hookEnvMap[blog] || "CF_DEPLOY_HOOK_URL";
  const hookUrl = process.env[envKey];
  if (!hookUrl) {
    return res.status(500).json({
      error: `${envKey} 환경변수가 설정되지 않았습니다. .env 파일을 확인하세요.`
    });
  }
  try {
    const response = await fetch(hookUrl, { method: "POST" });
    if (!response.ok) {
      return res.status(502).json({ error: `Cloudflare 빌드 트리거 실패: HTTP ${response.status}` });
    }
    res.json({ triggered: true, message: "Cloudflare 빌드가 트리거되었습니다. 약 1~2분 후 배포됩니다." });
  } catch (err) {
    res.status(500).json({ error: "빌드 트리거 오류: " + err.message });
  }
});

// ── 상품 이미지 검색 (SerpAPI Google Images) ──
app.get("/api/product-image-search", async (req, res) => {
  const { query } = req.query;
  if (!query) return res.status(400).json({ error: "query 파라미터가 필요합니다." });

  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) return res.status(500).json({ error: "SERPAPI_KEY 환경변수가 설정되지 않았습니다." });

  try {
    const url = `https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(query)}&hl=ko&gl=kr&num=6&api_key=${apiKey}`;
    const response = await fetch(url);
    if (!response.ok) return res.status(502).json({ error: `SerpAPI 오류: HTTP ${response.status}` });

    const data = await response.json();
    const images = (data.images_results || []).slice(0, 6).map(img => ({
      url: img.original,
      thumbnail: img.thumbnail,
      title: img.title,
      source: img.source,
    }));
    res.json({ images });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 네이버 키워드 분석 API ──

// 네이버 검색광고 API HMAC-SHA256 서명 생성
function makeNaverAdSignature(timestamp, method, path, secret) {
  const message = `${timestamp}.${method}.${path}`;
  return crypto.createHmac("sha256", secret).update(message).digest("base64");
}

// 키워드 검색량 + 관련 키워드 조회 (네이버 검색광고 API)
app.get("/api/keyword-research", async (req, res) => {
  const { keyword } = req.query;
  if (!keyword) return res.status(400).json({ error: "keyword 파라미터가 필요합니다." });

  const apiKey = process.env.NAVER_AD_API_KEY;
  const secret = process.env.NAVER_AD_SECRET;
  const customerId = process.env.NAVER_AD_CUSTOMER_ID;

  if (!apiKey || !secret || !customerId) {
    return res.status(400).json({ error: "네이버 검색광고 API 키가 설정되지 않았습니다. 시스템 설정에서 입력해주세요." });
  }

  try {
    const timestamp = Date.now().toString();
    const reqPath = "/keywordstool";
    const signature = makeNaverAdSignature(timestamp, "GET", reqPath, secret);

    const url = `https://api.searchad.naver.com${reqPath}?hintKeywords=${encodeURIComponent(keyword)}&showDetail=1`;
    const response = await fetch(url, {
      headers: {
        "X-Timestamp": timestamp,
        "X-API-KEY": apiKey,
        "X-Customer": customerId,
        "X-Signature": signature,
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `네이버 API 오류: ${errText}` });
    }

    const data = await response.json();
    const keywords = (data.keywordList || []).map((k) => ({
      keyword: k.relKeyword,
      pcSearchVolume: k.monthlyPcQcCnt === "< 10" ? 5 : Number(k.monthlyPcQcCnt) || 0,
      mobileSearchVolume: k.monthlyMobileQcCnt === "< 10" ? 5 : Number(k.monthlyMobileQcCnt) || 0,
      competition: k.compIdx, // low / mid / high
    }));

    res.json({ keywords });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 웹문서 경쟁 문서 수 조회 (네이버 웹문서 검색 API)
app.get("/api/keyword-competition", async (req, res) => {
  const { keyword } = req.query;
  if (!keyword) return res.status(400).json({ error: "keyword 파라미터가 필요합니다." });

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(400).json({ error: "네이버 오픈API 키가 설정되지 않았습니다. 시스템 설정에서 입력해주세요." });
  }

  try {
    const url = `https://openapi.naver.com/v1/search/webkr.json?query=${encodeURIComponent(keyword)}&display=1`;
    const response = await fetch(url, {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `네이버 API 오류: ${errText}` });
    }

    const data = await response.json();
    res.json({ total: data.total || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 스레드 계정 목록 조회 (thread auto 서버 프록시) ──
app.get("/api/threads/accounts", async (_req, res) => {
  try {
    const response = await fetch("http://localhost:3010/api/accounts");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(503).json({ success: false, message: "스레드 서버가 실행 중이지 않습니다. thread auto를 먼저 시작해주세요." });
  }
});

// ── 스레드 업로드 / 예약 발행 ──
app.post("/api/publish-threads", async (req, res) => {
  const { accountId, content, scheduleType, dateTime, cronExpression, repeatLabel } = req.body;
  if (!accountId || !content) {
    return res.status(400).json({ success: false, message: "accountId와 content가 필요합니다." });
  }
  try {
    let response;
    if (scheduleType === "now") {
      response = await fetch("http://localhost:3010/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, content }),
      });
    } else {
      response = await fetch("http://localhost:3010/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, content, scheduleType, dateTime, cronExpression, repeatLabel }),
      });
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(503).json({ success: false, message: "스레드 서버 오류: " + err.message });
  }
});

// ── 네이버 블로그 업로드 (방법 A: 임시 파일 → python main.py) ──
app.post("/api/publish-naver", async (req, res) => {
  const { title, content, mode } = req.body;
  if (!title || !content) {
    return res.status(400).json({ success: false, message: "title과 content가 필요합니다." });
  }

  const os = require("os");
  const tmpFile = path.join(os.tmpdir(), `naver_post_${Date.now()}.txt`);
  const naverDir = "C:\\Users\\iss59\\Desktop\\antigravity\\naver blog auto";

  try {
    // 임시 txt 파일 생성 (첫 줄=제목, 나머지=본문)
    fs.writeFileSync(tmpFile, `${title}\n${content}`, "utf8");

    await new Promise((resolve, reject) => {
      const child = spawn("python", ["main.py"], {
        cwd: naverDir,
        env: {
          ...process.env,
          POST_FILE_PATH: tmpFile,
          MODE: mode === "publish" ? "publish" : "draft",
        },
        shell: true,
      });

      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => { stdout += d.toString(); });
      child.stderr.on("data", (d) => { stderr += d.toString(); });

      child.on("close", (code) => {
        if (code === 0 || stdout.includes("완료")) {
          resolve(stdout);
        } else {
          reject(new Error(stderr || `프로세스 종료 코드: ${code}`));
        }
      });
      child.on("error", reject);
    });

    res.json({ success: true, message: "네이버 블로그 업로드가 완료되었습니다." });
  } catch (err) {
    res.status(500).json({ success: false, message: "네이버 업로드 오류: " + err.message });
  } finally {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  }
});

// ── 예약 발행 자동 스케줄러 ──
// 1분마다 각 블로그의 예약 글을 스캔해서 발행 시간이 지나면 CF 훅 트리거
const CF_HOOK_MAP = {
  weblog: () => process.env.CF_DEPLOY_HOOK_URL,
  blog2:  () => process.env.CF_DEPLOY_HOOK_URL_BLOG2,
  blog3:  () => process.env.CF_DEPLOY_HOOK_URL_BLOG3,
};
// 블로그별 마지막 트리거 시간 (중복 방지 — 같은 블로그를 5분 내 재트리거 안 함)
const lastTriggered = {};

async function checkAndTriggerScheduled() {
  const now = Date.now();
  for (const [blogKey, blogRoot] of Object.entries(BLOGS)) {
    const hookUrl = CF_HOOK_MAP[blogKey]?.();
    if (!hookUrl) continue;

    const blogDir = path.join(blogRoot, "src/data/blog");
    if (!fs.existsSync(blogDir)) continue;

    let files;
    try { files = fs.readdirSync(blogDir).filter(f => f.endsWith(".md")); }
    catch (_) { continue; }

    let needsTrigger = false;
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(blogDir, file), "utf-8");
        // draft: false 이고 pubDatetime이 있는 글만 대상
        if (!/draft:\s*false/.test(content)) continue;
        const pubMatch = content.match(/pubDatetime:\s*(.+)/);
        if (!pubMatch) continue;
        const pubTime = new Date(pubMatch[1].trim()).getTime();
        // 발행 시간이 지났고, 최근 10분 이내에 지난 글 (너무 오래된 건 무시)
        if (pubTime <= now && pubTime >= now - 10 * 60 * 1000) {
          needsTrigger = true;
          break;
        }
      } catch (_) { continue; }
    }

    if (needsTrigger) {
      // 같은 블로그 5분 내 중복 트리거 방지
      if (lastTriggered[blogKey] && now - lastTriggered[blogKey] < 5 * 60 * 1000) continue;
      lastTriggered[blogKey] = now;

      // git push 먼저 — 커밋 안 된 파일이 있으면 push 후 CF 훅 트리거
      try {
        const { execSync } = await import("child_process");
        const imageDir = path.join(blogRoot, "public/assets/images");
        if (fs.existsSync(imageDir)) {
          execSync(`git add "${imageDir}"`, { cwd: blogRoot });
        }
        execSync(`git add src/data/blog`, { cwd: blogRoot });
        try {
          execSync(`git commit -m "chore: scheduled publish trigger"`, { cwd: blogRoot });
          execSync("git push", { cwd: blogRoot });
          console.log(`[스케줄러] ${blogKey} git push 완료`);
        } catch (_) {
          // 커밋할 변경사항 없으면 무시
        }
      } catch (gitErr) {
        console.error(`[스케줄러] ${blogKey} git push 오류:`, gitErr.message);
      }

      try {
        const res = await fetch(hookUrl, { method: "POST" });
        if (res.ok) {
          console.log(`[스케줄러] ${blogKey} 예약 글 발행 트리거 완료 (${new Date().toLocaleString("ko-KR")})`);
        } else {
          console.error(`[스케줄러] ${blogKey} 트리거 실패: HTTP ${res.status}`);
        }
      } catch (err) {
        console.error(`[스케줄러] ${blogKey} 트리거 오류:`, err.message);
      }
    }
  }
}

// 서버 시작 후 1분 뒤부터 1분마다 실행
setTimeout(() => {
  checkAndTriggerScheduled();
  setInterval(checkAndTriggerScheduled, 60 * 1000);
}, 60 * 1000);

app.listen(PORT, () => {
  console.log(`\n---------------------------------`);
  console.log(`🚀 Dashboard server running at: http://localhost:${PORT}`);
  console.log(`---------------------------------\n`);
  open(`http://localhost:${PORT}`);
});

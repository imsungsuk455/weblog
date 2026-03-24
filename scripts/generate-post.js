import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";
import "dotenv/config";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function generatePost() {
  const model = genAI.getGenerativeModel({ model: "gemini-3-flash" });

  const topic = process.argv[2] || "a trendy technology or lifestyle topic";
  const rawDate = process.argv[3];
  const categoryArg = process.argv[4] || "others";
  const pubDate = (rawDate && rawDate.trim() !== "" && rawDate !== "undefined") ? new Date(rawDate) : new Date();

  // If the date is invalid, default to now
  if (isNaN(pubDate.getTime())) {
    console.warn(`Invalid date provided: ${rawDate}. Defaulting to now.`);
  }
  const finalDate = isNaN(pubDate.getTime()) ? new Date() : pubDate;

  const prompt = `
    Generate a high-quality blog post about: ${topic}.
    The output must be in Markdown format with the following frontmatter structure:

    ---
    author: AI Assistant
    pubDatetime: ${finalDate.toISOString()}
    title: [Title of the post]
    featured: false
    draft: true
    tags:
      - [tag1]
      - [tag2]
    category: ${categoryArg}
    description: [A short, engaging description of the post]
    ---

    [The post content in Markdown, with headings, lists, and clear explanations.]

    IMPORTANT:
    - Do NOT include ogImage in the frontmatter
    - Do NOT include any image references like ![...](/assets/...) or ![...](https://...)
    - Do NOT include any image markdown syntax
    - Only use text, headings, lists, code blocks, and tables

    Return only the markdown content, no extra text.
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Extract title for filename
    const titleMatch = text.match(/title:\s*(.*)/);
    const title = titleMatch ? titleMatch[1].trim().replace(/['"]/g, "") : "new-post";
    const slug = title.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
    const date = new Date().toISOString().split('T')[0];
    const fileName = `${date}-${slug}.md`;
    const filePath = path.join(process.cwd(), "src/data/blog", fileName);

    // Create directory if not exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, text.trim());
    console.log(`Successfully generated post: ${fileName}`);
  } catch (error) {
    console.error("Error generating post:", error);
    process.exit(1);
  }
}

generatePost();

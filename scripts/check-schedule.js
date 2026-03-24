#!/usr/bin/env node
/**
 * check-schedule.js
 * GitHub Actions에서 실행 — pubDatetime이 지났고 draft: true인 글을 자동 발행
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BLOG_DIR = path.join(__dirname, "../src/data/blog");

const now = new Date();
const publishedTitles = [];
const publishedFiles = [];

// 블로그 폴더의 모든 .md 파일 순회
const files = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith(".md"));

for (const file of files) {
  const filePath = path.join(BLOG_DIR, file);
  let content = fs.readFileSync(filePath, "utf8");

  // draft: true 인 글만 대상
  const draftMatch = content.match(/^draft:\s*(true|false)/m);
  if (!draftMatch || draftMatch[1] !== "true") continue;

  // pubDatetime 파싱
  const pubMatch = content.match(/^pubDatetime:\s*(.+)/m);
  if (!pubMatch) continue;

  const pubDatetime = new Date(pubMatch[1].trim());
  if (isNaN(pubDatetime.getTime())) continue;

  // 예약 시간이 지났으면 발행
  if (pubDatetime <= now) {
    content = content.replace(/^draft:\s*true/m, "draft: false");
    fs.writeFileSync(filePath, content, "utf8");

    const titleMatch = content.match(/^title:\s*["']?(.+?)["']?$/m);
    const title = titleMatch ? titleMatch[1].trim() : file;
    publishedTitles.push(title);
    publishedFiles.push(file);

    console.log(`✅ 발행됨: ${title} (예약: ${pubDatetime.toISOString()})`);
  } else {
    console.log(`⏳ 대기 중: ${file} (발행 예정: ${pubDatetime.toISOString()})`);
  }
}

if (publishedTitles.length === 0) {
  console.log("📭 발행할 예약 글 없음");
}

// GitHub Actions output 설정
const outputFile = process.env.GITHUB_OUTPUT;
if (outputFile) {
  const titlesStr = publishedTitles.slice(0, 3).join(", ") +
    (publishedTitles.length > 3 ? ` 외 ${publishedTitles.length - 3}건` : "");
  fs.appendFileSync(outputFile, `published_count=${publishedTitles.length}\n`);
  fs.appendFileSync(outputFile, `published_titles=${titlesStr}\n`);
}

process.exit(0);

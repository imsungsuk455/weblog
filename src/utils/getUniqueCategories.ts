import { slugifyStr } from "./slugify";
import type { CollectionEntry } from "astro:content";
import postFilter from "./postFilter";
import fs from "fs";
import path from "path";

interface Category {
  category: string;
  categoryName: string;
}

const getUniqueCategories = (posts: CollectionEntry<"blog">[]) => {
  const categoriesMap = new Map<string, string>();

  // 1. Get categories from existing posts
  posts.filter(postFilter).forEach(post => {
    const category = post.data.category || "General";
    categoriesMap.set(slugifyStr(category), category);
  });

  // 2. Get categories from .categories folder (even if empty)
  try {
    const categoriesDir = path.join(process.cwd(), "src/data/blog/.categories");
    if (fs.existsSync(categoriesDir)) {
      const files = fs.readdirSync(categoriesDir).filter(f => f.endsWith(".txt"));
      files.forEach(f => {
        const categoryName = f.replace(".txt", "");
        categoriesMap.set(slugifyStr(categoryName), categoryName);
      });
    }
  } catch (e) {
    console.warn("Failed to read .categories directory", e);
  }

  // Always include General
  if (!categoriesMap.has(slugifyStr("General"))) {
    categoriesMap.set(slugifyStr("General"), "General");
  }

  const categories: Category[] = Array.from(categoriesMap.entries())
    .map(([slug, name]) => ({
      category: slug,
      categoryName: name,
    }))
    .sort((a, b) => a.category.localeCompare(b.category));

  return categories;
};

export default getUniqueCategories;

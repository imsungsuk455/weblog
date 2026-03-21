import { slugifyStr } from "./slugify";
import type { CollectionEntry } from "astro:content";
import getSortedPosts from "./getSortedPosts";

const getPostsByCategory = (posts: CollectionEntry<"blog">[], category: string) =>
  getSortedPosts(
    posts.filter(post => slugifyStr(post.data.category || "General") === category)
  );

export default getPostsByCategory;

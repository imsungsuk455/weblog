import { slugifyStr } from "./slugify";
import type { CollectionEntry } from "astro:content";
import postFilter from "./postFilter";

interface Category {
  category: string;
  categoryName: string;
}

const getUniqueCategories = (posts: CollectionEntry<"blog">[]) => {
  const categories: Category[] = posts
    .filter(postFilter)
    .flatMap(post => {
      const category = post.data.category || "General";
      return {
        category: slugifyStr(category),
        categoryName: category,
      };
    })
    .filter(
      (value, index, self) =>
        self.findIndex(c => c.category === value.category) === index
    )
    .sort((a, b) => a.category.localeCompare(b.category));
  return categories;
};

export default getUniqueCategories;

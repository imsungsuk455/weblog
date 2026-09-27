import type { CollectionEntry } from "astro:content";
import { SITE, SITE_ID_CURRENT } from "@/config";

const postFilter = ({ data }: CollectionEntry<"blog">) => {
  const isPublishTimePassed =
    Date.now() >
    new Date(data.pubDatetime).getTime() - SITE.scheduledPostMargin;
  const isForThisSite = (data.sites ?? ["nomad"]).includes(SITE_ID_CURRENT);
  return !data.draft && isForThisSite && (import.meta.env.DEV || isPublishTimePassed);
};

export default postFilter;

import {getExcerptFallback, type BlogPost} from './blog';

const WEBFLOW_API_BASE = 'https://api.webflow.com/v2';

const FIELD_SLUGS = {
  h1: process.env.WEBFLOW_BLOG_H1_FIELD ?? "name",
  author: process.env.WEBFLOW_BLOG_AUTHOR_FIELD ?? "author",
  excerpt: process.env.WEBFLOW_BLOG_EXCERPT_FIELD ?? "extrait-de-l-article",
  contentHtml: process.env.WEBFLOW_BLOG_CONTENT_FIELD ?? "corps-de-l-article",
  coverImage: process.env.WEBFLOW_BLOG_COVER_IMAGE_FIELD ?? "banniere",
  ogImage: process.env.WEBFLOW_BLOG_OG_IMAGE_FIELD ?? "banniere",
  seoTitle: process.env.WEBFLOW_BLOG_SEO_TITLE_FIELD ?? "meta-titre",
  seoDescription: process.env.WEBFLOW_BLOG_SEO_DESCRIPTION_FIELD ?? "meta-description",
  publishedAt: process.env.WEBFLOW_BLOG_PUBLISHED_AT_FIELD ?? "date-de-publication",
} as const;

function getWebflowConfig() {
  const token = process.env.WEBFLOW_API_TOKEN;
  const collectionId = process.env.WEBFLOW_BLOG_COLLECTION_ID;
  const cmsLocaleId = process.env.WEBFLOW_CMS_LOCALE_ID;

  if (!token || !collectionId) {
    return null;
  }

  return {token, collectionId, cmsLocaleId};
}

async function webflowFetch<T>(pathname: string, searchParams: Record<string, string | undefined>) {
  const config = getWebflowConfig();

  if (!config) {
    return null;
  }

  const url = new URL(`${WEBFLOW_API_BASE}${pathname}`);
  Object.entries(searchParams).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.token}`,
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Webflow CMS request failed (${response.status} ${response.statusText})`);
  }

  return (await response.json()) as T;
}

function getAssetUrl(value: unknown) {
  if (!value) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'object' && value !== null && 'url' in value && typeof value.url === 'string') {
    return value.url;
  }

  return undefined;
}

function mapBlogPost(item: any): BlogPost {
  const fieldData = item?.fieldData ?? {};
  const contentHtml = fieldData[FIELD_SLUGS.contentHtml] ?? fieldData['corps-de-l-article'] ?? fieldData['corps-article'] ?? '';

  return {
    id: item.id,
    slug: fieldData.slug ?? '',
    title: fieldData.name ?? 'Article',
    displayTitle: fieldData[FIELD_SLUGS.h1] ?? fieldData.name ?? 'Article',
    author: fieldData[FIELD_SLUGS.author] ?? 'Marika',
    excerpt: fieldData[FIELD_SLUGS.excerpt] ?? getExcerptFallback(contentHtml),
    contentHtml,
    coverImage: getAssetUrl(fieldData[FIELD_SLUGS.coverImage]),
    ogImage: getAssetUrl(fieldData[FIELD_SLUGS.ogImage]),
    seoTitle: fieldData[FIELD_SLUGS.seoTitle] ?? undefined,
    seoDescription: fieldData[FIELD_SLUGS.seoDescription] ?? undefined,
    publishedAt: fieldData[FIELD_SLUGS.publishedAt] ?? item.lastPublished ?? item.lastUpdated,
  };
}

export async function listBlogPosts() {
  const config = getWebflowConfig();

  if (!config) {
    console.warn('[blog] WEBFLOW_API_TOKEN or WEBFLOW_BLOG_COLLECTION_ID missing. Blog prerender skipped.');
    return [] as BlogPost[];
  }

  const posts: BlogPost[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const response = await webflowFetch<{
      items: any[];
      pagination: {total: number; offset: number; limit: number};
    }>(`/collections/${config.collectionId}/items/live`, {
      limit: String(limit),
      offset: String(offset),
      cmsLocaleId: config.cmsLocaleId,
    });

    if (!response) {
      return [];
    }

    posts.push(...response.items.map(mapBlogPost));

    const loaded = response.pagination.offset + response.pagination.limit;
    if (loaded >= response.pagination.total) {
      break;
    }

    offset = loaded;
  }

  return posts
    .filter((post) => post.slug && post.title)
    .sort((a, b) => {
      const aTime = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const bTime = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return bTime - aTime;
    });
}

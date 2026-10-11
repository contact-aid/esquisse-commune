import fs from 'node:fs/promises';
import {loadEnv} from 'vite';
import path from 'node:path';
import {renderToString} from 'react-dom/server';
import React from 'react';
import {StaticRouter} from 'react-router-dom';
import App from '../src/App';
import {siteConfig} from '../src/data/site';
import {BUSINESS_PAGE_PATHS, BUSINESS_PAGE_SEO, getBusinessPageJsonLd} from '../src/lib/business-pages';
import {
  getBlogIndexPath,
  getBlogIndexJsonLd,
  getBlogIndexSeo,
  getBlogPostPath,
  getBlogPostJsonLd,
  getBlogPostSeo,
  toBlogPostSummary,
  type BlogPageData,
} from '../src/lib/blog';
import {BlogPageDataProvider} from '../src/lib/blog-context';
import {renderJsonLdTags, renderSeoTags} from '../src/lib/seo';
import {STATIC_SITE_ROUTES} from '../src/lib/site-routes';

// Charger les fichiers locaux tout en conservant les variables de l'hébergeur.
for (const [key, value] of Object.entries(loadEnv('production', process.cwd(), ''))) {
  process.env[key] ??= value;
}
const {listBlogPosts} = await import('../src/lib/webflow.server');

type StaticSeo = Parameters<typeof renderSeoTags>[0];

const DEFAULT_OG_IMAGE = new URL('/esquisse-exterieur.jpg', siteConfig.siteUrl).toString();

const HOME_LOCAL_BUSINESS_JSONLD = [
  {
    id: 'home-local-business',
    data: {
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      '@id': `${siteConfig.siteUrl}/#localbusiness`,
      name: siteConfig.brand,
      alternateName: [...siteConfig.brandAlternates],
      image: DEFAULT_OG_IMAGE,
      url: `${siteConfig.siteUrl}/`,
      telephone: `+33${siteConfig.phoneLink.replace(/^0/, '')}`,
      email: siteConfig.email,
      address: {
        '@type': 'PostalAddress',
        streetAddress: siteConfig.address.street,
        postalCode: siteConfig.address.postalCode,
        addressLocality: siteConfig.address.city,
        addressCountry: 'FR',
      },
      geo: {
        '@type': 'GeoCoordinates',
        latitude: 48.0379,
        longitude: -1.6927,
      },
      areaServed: ['Rennes', 'Rennes Métropole', 'Chartres-de-Bretagne', 'Bretagne'],
      priceRange: '500€-900€',
    },
  },
];

const STATIC_ROUTE_SEO: Record<string, StaticSeo> = {
  '/': {
    title: "Bureaux à louer à Chartres-de-Bretagne, à 15 min de Rennes — L'esquisse commune",
    description:
      'Location de bureaux privés neufs à Chartres-de-Bretagne, proche rocade Sud de Rennes. Bail flexible ou 3/6/9, à partir de 500€/mois. Salles de réunion équipées disponibles. Visite sur rendez-vous au 06 37 94 64 10.',
    canonicalPath: '/',
    ogImage: DEFAULT_OG_IMAGE,
  },
  '/mentions-legales': {
    title: "Mentions légales — L'esquisse commune",
    description:
      "Mentions légales de L'esquisse commune : éditeur, hébergeur et informations légales du site de location de bureaux à Chartres-de-Bretagne.",
    canonicalPath: '/mentions-legales',
    ogImage: DEFAULT_OG_IMAGE,
  },
  '/politique-confidentialite': {
    title: "Politique de confidentialité — L'esquisse commune",
    description:
      "Politique de confidentialité de L'esquisse commune : traitement des données personnelles, cookies et droits des utilisateurs sur esquisse.aidhabitat.fr.",
    canonicalPath: '/politique-confidentialite',
    ogImage: DEFAULT_OG_IMAGE,
  },
  '/cgv': {
    title: "Conditions générales de vente — L'esquisse commune",
    description:
      "Conditions générales de vente et de location des bureaux privés et salles de réunion de L'esquisse commune à Chartres-de-Bretagne.",
    canonicalPath: '/cgv',
    ogImage: DEFAULT_OG_IMAGE,
  },
  [BUSINESS_PAGE_PATHS.desks]: BUSINESS_PAGE_SEO.desks,
  [BUSINESS_PAGE_PATHS.rooms]: BUSINESS_PAGE_SEO.rooms,
};

const rootDir = process.cwd();
const distDir = path.join(rootDir, 'dist');

async function readTemplate() {
  return fs.readFile(path.join(distDir, 'index.html'), 'utf-8');
}

function injectSeo(
  template: string,
  seo: Parameters<typeof renderSeoTags>[0],
  jsonLdEntries: ReadonlyArray<{id: string; data: Record<string, unknown>}> = [],
) {
  let html = template;

  const replacements: Array<[RegExp, string]> = [
    [/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(seo.title)}</title>`],
    [
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="description" content="${escapeHtml(seo.description)}" />`,
    ],
    [
      /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:title" content="${escapeHtml(seo.ogTitle ?? seo.title)}" />`,
    ],
    [
      /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:description" content="${escapeHtml(seo.ogDescription ?? seo.description)}" />`,
    ],
    [
      /<meta\s+property="og:type"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:type" content="${escapeHtml(seo.ogType ?? 'website')}" />`,
    ],
    [
      /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="twitter:title" content="${escapeHtml(seo.ogTitle ?? seo.title)}" />`,
    ],
    [
      /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="twitter:description" content="${escapeHtml(seo.ogDescription ?? seo.description)}" />`,
    ],
    [
      /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
      `<link rel="canonical" href="${new URL(seo.canonicalPath ?? '/', siteConfig.siteUrl).toString()}" />`,
    ],
  ];

  replacements.forEach(([pattern, replacement]) => {
    html = html.replace(pattern, replacement);
  });

  const extraSeo = renderSeoTags(seo, siteConfig.siteUrl)
    .split('\n')
    .filter((line) => line.includes('og:image') || line.includes('twitter:image') || line.includes('og:url'))
    .join('\n');

  if (extraSeo) {
    html = html.replace('</head>', `${extraSeo}\n</head>`);
  }

  if (jsonLdEntries.length > 0) {
    html = html.replace('</head>', `${renderJsonLdTags(jsonLdEntries)}\n</head>`);
  }

  return html;
}

function injectAppHtml(template: string, appHtml: string, pageData: BlogPageData) {
  const serializedData = JSON.stringify(pageData).replace(/</g, '\\u003c');
  return template.replace(
    '<div id="root"></div>',
    `<div id="root">${appHtml}</div><script>window.__BLOG_DATA__=${serializedData};</script>`,
  );
}

async function writeRouteFile(routePath: string, html: string) {
  const filePath =
    routePath === getBlogIndexPath()
      ? path.join(distDir, 'blog', 'index.html')
      : path.join(distDir, routePath.replace(/^\//, ''), 'index.html');

  await fs.mkdir(path.dirname(filePath), {recursive: true});
  await fs.writeFile(filePath, html, 'utf-8');
}

function renderRoute(routePath: string, data: BlogPageData) {
  return renderToString(
    <BlogPageDataProvider value={data}>
      <StaticRouter location={routePath}>
        <App />
      </StaticRouter>
    </BlogPageDataProvider>,
  );
}

function renderStaticRoute(routePath: string) {
  return renderToString(
    <BlogPageDataProvider value={null}>
      <StaticRouter location={routePath}>
        <App />
      </StaticRouter>
    </BlogPageDataProvider>,
  );
}

function injectStaticAppHtml(template: string, appHtml: string) {
  return template.replace('<div id="root"></div>', `<div id="root">${appHtml}</div>`);
}

function staticRouteOutputPath(routePath: string) {
  return routePath === '/'
    ? path.join(distDir, 'index.html')
    : path.join(distDir, routePath.replace(/^\//, ''), 'index.html');
}

async function writeJsonData(posts: Awaited<ReturnType<typeof listBlogPosts>>) {
  const blogDataDir = path.join(distDir, 'blog-data');
  const postDataDir = path.join(blogDataDir, 'posts');

  await fs.mkdir(postDataDir, {recursive: true});
  await fs.writeFile(
    path.join(blogDataDir, 'index.json'),
    JSON.stringify(posts.map(toBlogPostSummary), null, 2),
    'utf-8',
  );

  await Promise.all(
    posts.map((post) =>
      fs.writeFile(path.join(postDataDir, `${post.slug}.json`), JSON.stringify(post, null, 2), 'utf-8'),
    ),
  );
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function toAbsoluteUrl(pathname: string) {
  return new URL(pathname, siteConfig.siteUrl).toString();
}

function formatLastMod(value?: string) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function renderUrlSet(
  entries: Array<{pathname: string; lastmod?: string; changefreq?: string; priority?: number}>,
) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    ({pathname, lastmod, changefreq, priority}) => `  <url>
    <loc>${escapeHtml(toAbsoluteUrl(pathname))}</loc>
    <lastmod>${escapeHtml(formatLastMod(lastmod))}</lastmod>
    ${changefreq ? `<changefreq>${escapeHtml(changefreq)}</changefreq>` : ''}
    ${typeof priority === 'number' ? `<priority>${priority.toFixed(1)}</priority>` : ''}
  </url>`,
  )
  .join('\n')}
</urlset>
`;
}

function renderSitemapIndex(entries: Array<{pathname: string; lastmod?: string}>) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    ({pathname, lastmod}) => `  <sitemap>
    <loc>${escapeHtml(toAbsoluteUrl(pathname))}</loc>
    <lastmod>${escapeHtml(formatLastMod(lastmod))}</lastmod>
  </sitemap>`,
  )
  .join('\n')}
</sitemapindex>
`;
}

async function writeSitemaps(posts: Awaited<ReturnType<typeof listBlogPosts>>) {
  const generatedAt = new Date().toISOString();
  const pageSitemap = renderUrlSet(
    STATIC_SITE_ROUTES.map((route) => ({
      pathname: route.path,
      lastmod: generatedAt,
      changefreq: route.changeFrequency,
      priority: route.priority,
    })),
  );
  const blogSitemap = renderUrlSet([
    {
      pathname: getBlogIndexPath(),
      lastmod: posts[0]?.publishedAt ?? generatedAt,
      changefreq: 'weekly',
      priority: 0.8,
    },
    ...posts.map((post) => ({
      pathname: getBlogPostPath(post.slug),
      lastmod: post.publishedAt,
      changefreq: 'monthly',
      priority: 0.7,
    })),
  ]);

  await fs.writeFile(path.join(distDir, 'sitemap-pages.xml'), pageSitemap, 'utf-8');
  await fs.writeFile(path.join(distDir, 'sitemap-blog.xml'), blogSitemap, 'utf-8');
  await fs.writeFile(
    path.join(distDir, 'sitemap.xml'),
    renderSitemapIndex([
      {pathname: '/sitemap-pages.xml', lastmod: generatedAt},
      {pathname: '/sitemap-blog.xml', lastmod: posts[0]?.publishedAt ?? generatedAt},
    ]),
    'utf-8',
  );
}

async function main() {
  const template = await readTemplate();
  const posts = await listBlogPosts();

  await writeJsonData(posts);

  for (const route of STATIC_SITE_ROUTES) {
    const seo = STATIC_ROUTE_SEO[route.path];
    if (!seo) {
      console.warn(`[prerender] no SEO config for ${route.path}, skipping`);
      continue;
    }

    const jsonLdEntries =
      route.path === '/'
        ? HOME_LOCAL_BUSINESS_JSONLD
        : route.path === BUSINESS_PAGE_PATHS.desks
          ? [...getBusinessPageJsonLd('desks')]
          : route.path === BUSINESS_PAGE_PATHS.rooms
            ? [...getBusinessPageJsonLd('rooms')]
            : [];
    const html = injectStaticAppHtml(injectSeo(template, seo, jsonLdEntries), renderStaticRoute(route.path));
    const outputPath = staticRouteOutputPath(route.path);
    await fs.mkdir(path.dirname(outputPath), {recursive: true});
    await fs.writeFile(outputPath, html, 'utf-8');
    console.log(`[prerender] wrote ${path.relative(rootDir, outputPath)}`);
  }

  const indexData: BlogPageData = {
    kind: 'index',
    posts: posts.map(toBlogPostSummary),
  };

  const blogIndexHtml = injectAppHtml(
    injectSeo(template, getBlogIndexSeo(), getBlogIndexJsonLd(indexData.posts)),
    renderRoute(getBlogIndexPath(), indexData),
    indexData,
  );

  await writeRouteFile(getBlogIndexPath(), blogIndexHtml);

  await Promise.all(
    posts.map(async (post) => {
      const postData: BlogPageData = {kind: 'post', post};
      const postHtml = injectAppHtml(
        injectSeo(template, getBlogPostSeo(post), getBlogPostJsonLd(post)),
        renderRoute(getBlogPostPath(post.slug), postData),
        postData,
      );

      await writeRouteFile(getBlogPostPath(post.slug), postHtml);
    }),
  );

  await writeSitemaps(posts);
}

main().catch((error) => {
  console.error('[blog] prerender failed');
  console.error(error);
  process.exit(1);
});

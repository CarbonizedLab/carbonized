'use strict';
const productionHost =
  process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;

const siteUrl = (() => {
  if (process.env.NODE_ENV === 'development') {
    return new URL('https://localhost:3000');
  }
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return new URL(process.env.NEXT_PUBLIC_APP_URL);
  }
  return productionHost
    ? new URL(`https://${productionHost}`)
    : new URL('https://localhost:3000');
})();

/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl,
  generateRobotsTxt: true,
};

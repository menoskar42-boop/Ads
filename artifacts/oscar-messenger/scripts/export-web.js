const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function deploymentDomain() {
  const value =
    process.env.REPLIT_INTERNAL_APP_DOMAIN ||
    process.env.REPLIT_DEV_DOMAIN ||
    process.env.EXPO_PUBLIC_DOMAIN;
  if (!value) {
    console.error(
      'ERROR: No deployment domain found. Set REPLIT_INTERNAL_APP_DOMAIN, REPLIT_DEV_DOMAIN, or EXPO_PUBLIC_DOMAIN',
    );
    process.exit(1);
  }
  return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).host;
}

function directorySize(directory) {
  let total = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    total += entry.isDirectory()
      ? directorySize(entryPath)
      : fs.statSync(entryPath).size;
  }
  return total;
}

function addPwaHeadMetadata(outputDirectory) {
  const htmlPath = path.join(outputDirectory, 'index.html');
  let html = fs.readFileSync(htmlPath, 'utf8');
  html = html.replace(/<html\b([^>]*)>/i, (_tag, attributes) => {
    const cleanAttributes = attributes
      .replace(/\s+lang=(?:"[^"]*"|'[^']*')/i, '')
      .replace(/\s+dir=(?:"[^"]*"|'[^']*')/i, '');
    return `<html${cleanAttributes} lang="ar" dir="rtl">`;
  });

  const headTags = [
    ['href="/oscar-messenger/manifest.webmanifest"', '<link rel="manifest" href="/oscar-messenger/manifest.webmanifest" />'],
    ['name="theme-color"', '<meta name="theme-color" content="#0A101B" />'],
    ['rel="apple-touch-icon"', '<link rel="apple-touch-icon" href="/oscar-messenger/icons/icon-192.png" />'],
    ['name="apple-mobile-web-app-capable"', '<meta name="apple-mobile-web-app-capable" content="yes" />'],
  ];
  const missingTags = headTags
    .filter(([marker]) => !html.includes(marker))
    .map(([, tag]) => `    ${tag}`)
    .join('\n');
  if (missingTags) {
    if (!html.includes('</head>')) {
      throw new Error('Expo web export did not produce an HTML head to add PWA metadata.');
    }
    html = html.replace('</head>', `${missingTags}\n  </head>`);
  }
  fs.writeFileSync(htmlPath, html);
}

const domain = deploymentDomain();
const projectRoot = path.resolve(__dirname, '..');
const env = {
  ...process.env,
  EXPO_PUBLIC_DOMAIN: domain,
  EXPO_PUBLIC_REPL_ID: process.env.REPL_ID || process.env.EXPO_PUBLIC_REPL_ID || '',
  EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY:
    process.env.CLERK_PUBLISHABLE_KEY ||
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ||
    '',
  EXPO_PUBLIC_CLERK_PROXY_URL: process.env.CLERK_PROXY_URL
    ? `https://${domain}${process.env.CLERK_PROXY_URL}`
    : '',
};

const result = spawnSync(
  'pnpm',
  ['exec', 'expo', 'export', '--platform', 'web', '--output-dir', 'dist-web'],
  { cwd: projectRoot, env, stdio: 'inherit' },
);

if (result.error) {
  console.error('Web export failed to start:', result.error.message);
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status || 1);

const outputDirectory = path.join(projectRoot, 'dist-web');
addPwaHeadMetadata(outputDirectory);
const totalBytes = directorySize(outputDirectory);
const bundleDirectory = path.join(outputDirectory, '_expo', 'static', 'js', 'web');
const bundleBytes = fs.existsSync(bundleDirectory) ? directorySize(bundleDirectory) : 0;
console.log(
  `Web export size: ${(totalBytes / 1024 / 1024).toFixed(2)} MiB total; ` +
    `${(bundleBytes / 1024 / 1024).toFixed(2)} MiB JavaScript bundles.`,
);

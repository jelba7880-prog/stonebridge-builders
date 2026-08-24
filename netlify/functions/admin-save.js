// netlify/functions/admin-save.js
// Verifies the admin session cookie, then reads/updates data/projects.json
// via the GitHub Contents API and commits directly to main. That commit
// triggers the site's existing Netlify auto-deploy.

const crypto = require('crypto');

const COOKIE_NAME = 'sb_admin_session';
const GITHUB_OWNER = 'jelba7880-prog';
const GITHUB_REPO = 'stonebridge-builders';
const GITHUB_BRANCH = 'main';
const DATA_PATH = 'data/projects.json';

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function digest(value) {
  return crypto.createHash('sha256').update(String(value)).digest();
}

function constantTimeEqual(a, b) {
  return crypto.timingSafeEqual(digest(a), digest(b));
}

function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  });
  return out;
}

function isAuthorized(event, adminPassword) {
  const cookies = parseCookies(event.headers.cookie || event.headers.Cookie);
  const token = cookies[COOKIE_NAME];
  if (!token) return false;

  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [version, expiresAt, sig] = parts;
  const payload = `${version}.${expiresAt}`;

  if (!constantTimeEqual(sig, sign(payload, adminPassword))) return false;
  if (Date.now() > Number(expiresAt)) return false;
  return true;
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CLOUDINARY_URL_RE = /^https:\/\/res\.cloudinary\.com\/dnnvpvrle\/image\/upload\/.+/;

function isValidPhotoUrl(url) {
  return typeof url === 'string' && CLOUDINARY_URL_RE.test(url);
}

function validateMeta(meta) {
  return meta && typeof meta.type === 'string' && meta.type.trim() &&
    typeof meta.state === 'string' && meta.state.trim() &&
    typeof meta.builder === 'string' && meta.builder.trim();
}

function validateNewProject(project) {
  if (!project || typeof project !== 'object') return 'Missing project data';
  if (typeof project.slug !== 'string' || !SLUG_RE.test(project.slug)) return 'Invalid slug';
  if (typeof project.title !== 'string' || !project.title.trim()) return 'Missing title';
  if (typeof project.description !== 'string' || !project.description.trim()) return 'Missing description';
  if (!isValidPhotoUrl(project.heroImage)) return 'Invalid hero image URL';
  if (!validateMeta(project.meta)) return 'Missing project type, state, or builder';
  if (!Array.isArray(project.gallery) || project.gallery.length === 0 || !project.gallery.every(isValidPhotoUrl)) {
    return 'Gallery must be a non-empty array of Cloudinary image URLs';
  }
  return null;
}

async function githubRequest(path, options = {}) {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'stonebridge-admin-function',
      ...(options.headers || {}),
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`GitHub API ${path} failed: ${res.status} ${body && body.message}`);
  }
  return body;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword || !process.env.GITHUB_TOKEN) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Admin save is not configured' }) };
  }

  if (!isAuthorized(event, adminPassword)) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Not authenticated' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  try {
    const current = await githubRequest(`contents/${DATA_PATH}?ref=${GITHUB_BRANCH}`);
    const projects = JSON.parse(Buffer.from(current.content, 'base64').toString('utf8'));

    let commitMessage;

    if (payload.action === 'addPhotos') {
      const { slug, photos } = payload;
      const project = projects.find((p) => p.slug === slug);
      if (!project) {
        return { statusCode: 404, body: JSON.stringify({ error: 'Project not found' }) };
      }
      if (!Array.isArray(photos) || photos.length === 0 || !photos.every(isValidPhotoUrl)) {
        return { statusCode: 400, body: JSON.stringify({ error: 'photos must be a non-empty array of Cloudinary image URLs' }) };
      }
      photos.forEach((url) => {
        if (!project.gallery.includes(url)) project.gallery.push(url);
      });
      commitMessage = `Add ${photos.length} photo(s) to ${slug}`;
    } else if (payload.action === 'createProject') {
      const { project } = payload;
      const error = validateNewProject(project);
      if (error) {
        return { statusCode: 400, body: JSON.stringify({ error }) };
      }
      if (projects.some((p) => p.slug === project.slug)) {
        return { statusCode: 409, body: JSON.stringify({ error: 'A project with that slug already exists' }) };
      }
      projects.push({
        slug: project.slug,
        title: project.title,
        heroImage: project.heroImage,
        description: project.description,
        meta: {
          type: project.meta.type,
          state: project.meta.state,
          builder: project.meta.builder,
        },
        gallery: project.gallery,
      });
      commitMessage = `Add new project: ${project.title}`;
    } else {
      return { statusCode: 400, body: JSON.stringify({ error: 'Unknown action' }) };
    }

    const updatedContent = Buffer.from(JSON.stringify(projects, null, 2) + '\n', 'utf8').toString('base64');
    await githubRequest(`contents/${DATA_PATH}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: commitMessage,
        content: updatedContent,
        sha: current.sha,
        branch: GITHUB_BRANCH,
      }),
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: 'Failed to save changes', detail: err.message }) };
  }
};

const fs = require('fs/promises');
const path = require('path');

const CACHE_FILE_PATH = process.env.CACHE_FILE_PATH || 'storage/digiforma-cache.json';

function getCachePath() {
  /**
   * Important Vercel :
   * - /tmp/digiforma-cache.json doit rester un chemin absolu.
   * - storage/digiforma-cache.json peut rester relatif au projet en local.
   */
  if (path.isAbsolute(CACHE_FILE_PATH)) {
    return CACHE_FILE_PATH;
  }

  return path.join(process.cwd(), CACHE_FILE_PATH);
}

async function ensureStorageDirectory() {
  const cachePath = getCachePath();
  const directory = path.dirname(cachePath);

  await fs.mkdir(directory, {
    recursive: true
  });
}

async function saveDigiformaCache(payload) {
  await ensureStorageDirectory();

  const cachePayload = {
    ...payload,
    receivedAt: new Date().toISOString()
  };

  await fs.writeFile(
    getCachePath(),
    JSON.stringify(cachePayload, null, 2),
    'utf8'
  );

  return cachePayload;
}

async function getDigiformaCache() {
  try {
    const content = await fs.readFile(getCachePath(), 'utf8');

    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

async function clearDigiformaCache() {
  try {
    await fs.unlink(getCachePath());

    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

function validateDigiformaCache(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Payload cache invalide.');
  }

  if (!payload.planning || typeof payload.planning !== 'object') {
    throw new Error('Le bloc planning est manquant dans le cache.');
  }

  if (!payload.reminders || typeof payload.reminders !== 'object') {
    throw new Error('Le bloc reminders est manquant dans le cache.');
  }

  if (!Array.isArray(payload.planning.results)) {
    throw new Error('planning.results doit être un tableau.');
  }

  if (!Array.isArray(payload.reminders.results)) {
    throw new Error('reminders.results doit être un tableau.');
  }

  return true;
}

module.exports = {
  saveDigiformaCache,
  getDigiformaCache,
  clearDigiformaCache,
  validateDigiformaCache,
  getCachePath
};
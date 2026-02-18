'use strict';

const fs = require('fs');
const path = require('path');

const GOLDEN_DIR = path.join(__dirname, '..', 'fixtures', 'golden');

/**
 * Compare actual output against a golden file.
 * When UPDATE_GOLDEN=1 env is set or the golden file doesn't exist,
 * writes the actual data as the new golden file instead of comparing.
 *
 * @param {*} actual - The actual output to compare (will be JSON-serialized)
 * @param {string} goldenName - Name of the golden file (e.g., 'inicial-ef-manifest.json')
 * @param {object} [opts] - Options
 * @param {string[]} [opts.ignoreKeys] - Keys to strip before comparison (e.g., timestamps)
 * @param {boolean} [opts.update] - Force update mode (overrides env)
 */
function assertGoldenFile(actual, goldenName, opts = {}) {
  const goldenPath = path.join(GOLDEN_DIR, goldenName);
  const updateMode = opts.update || process.env.UPDATE_GOLDEN === '1';

  // Normalize: strip non-deterministic keys
  const cleaned = stripKeys(actual, opts.ignoreKeys || []);
  const serialized = JSON.stringify(cleaned, null, 2) + '\n';

  if (updateMode || !fs.existsSync(goldenPath)) {
    fs.mkdirSync(path.dirname(goldenPath), { recursive: true });
    fs.writeFileSync(goldenPath, serialized, 'utf-8');
    console.log(`[golden] Updated: ${goldenName}`);
    return;
  }

  const expected = fs.readFileSync(goldenPath, 'utf-8');
  expect(serialized).toEqual(expected);
}

/**
 * Recursively strip specified keys from an object.
 */
function stripKeys(obj, keys) {
  if (!keys.length || obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(item => stripKeys(item, keys));

  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    if (keys.includes(k)) continue;
    result[k] = stripKeys(v, keys);
  }
  return result;
}

/**
 * Load a golden file and return parsed JSON.
 */
function loadGolden(goldenName) {
  const goldenPath = path.join(GOLDEN_DIR, goldenName);
  if (!fs.existsSync(goldenPath)) return null;
  return JSON.parse(fs.readFileSync(goldenPath, 'utf-8'));
}

/**
 * List all golden files.
 */
function listGoldenFiles() {
  if (!fs.existsSync(GOLDEN_DIR)) return [];
  return fs.readdirSync(GOLDEN_DIR).sort();
}

module.exports = {
  assertGoldenFile,
  loadGolden,
  listGoldenFiles,
  stripKeys,
  GOLDEN_DIR
};

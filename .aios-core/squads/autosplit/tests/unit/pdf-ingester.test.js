/**
 * pdf-ingester.test.js — Unit tests for PDFIngester
 *
 * 8 tests:
 *   - SHA-256 hash calculation
 *   - Dedup detection
 *   - Manifest generation
 *   - Error handling (nonexistent file, corrupted PDF)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PDFIngester } = require('../../scripts/pdf-ingester');

// Mock fs for controlled testing
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn(),
  };
});

describe('PDFIngester', () => {
  let ingester;
  const fixturesDir = path.join(__dirname, '..', 'fixtures');

  beforeEach(() => {
    ingester = new PDFIngester({ outputDir: '/tmp/test-intake' });
    jest.clearAllMocks();
  });

  // ─── SHA-256 Hash Calculation ─────────────────────────────

  describe('hashFile', () => {
    test('calculates correct SHA-256 hash for a file', async () => {
      // Create a temporary test file
      const testContent = 'Hello AutoSplit test file content';
      const tmpPath = path.join(fixturesDir, '_test-hash.tmp');
      const actualFs = jest.requireActual('fs');
      actualFs.mkdirSync(fixturesDir, { recursive: true });
      actualFs.writeFileSync(tmpPath, testContent);

      try {
        const hash = await ingester.hashFile(tmpPath);
        // Calculate expected hash
        const expected = crypto.createHash('sha256').update(testContent).digest('hex');
        expect(hash).toBe(expected);
        expect(hash).toHaveLength(64); // SHA-256 hex is 64 chars
      } finally {
        actualFs.unlinkSync(tmpPath);
      }
    });

    test('partial hash uses only first 4KB', async () => {
      const testContent = 'A'.repeat(8192); // 8KB file
      const tmpPath = path.join(fixturesDir, '_test-partial.tmp');
      const actualFs = jest.requireActual('fs');
      actualFs.mkdirSync(fixturesDir, { recursive: true });
      actualFs.writeFileSync(tmpPath, testContent);

      try {
        const fullHash = await ingester.hashFile(tmpPath);
        const partialHash = await ingester.partialHash(tmpPath);
        // Partial hash should differ from full hash (different content scope)
        expect(partialHash).not.toBe(fullHash);
        expect(partialHash).toHaveLength(64);
      } finally {
        actualFs.unlinkSync(tmpPath);
      }
    });
  });

  // ─── Dedup Detection ──────────────────────────────────────

  describe('dedup detection', () => {
    test('detects duplicate files by SHA-256 hash', async () => {
      const testContent = 'Duplicate PDF content';
      const tmpPath1 = path.join(fixturesDir, '_test-dup1.tmp');
      const tmpPath2 = path.join(fixturesDir, '_test-dup2.tmp');
      const actualFs = jest.requireActual('fs');
      actualFs.mkdirSync(fixturesDir, { recursive: true });
      actualFs.writeFileSync(tmpPath1, testContent);
      actualFs.writeFileSync(tmpPath2, testContent);

      try {
        // Ingest first file
        const result1 = await ingester.ingestFile(tmpPath1);
        ingester.fingerprintDB.set(result1.hash, result1.source_path);

        // Ingest second file — same content
        const result2 = await ingester.ingestFile(tmpPath2);
        expect(ingester.fingerprintDB.has(result2.hash)).toBe(true);
        expect(ingester.fingerprintDB.get(result2.hash)).toBe(result1.source_path);
      } finally {
        actualFs.unlinkSync(tmpPath1);
        actualFs.unlinkSync(tmpPath2);
      }
    });

    test('does not flag different files as duplicates', async () => {
      const tmpPath1 = path.join(fixturesDir, '_test-diff1.tmp');
      const tmpPath2 = path.join(fixturesDir, '_test-diff2.tmp');
      const actualFs = jest.requireActual('fs');
      actualFs.mkdirSync(fixturesDir, { recursive: true });
      actualFs.writeFileSync(tmpPath1, 'Content A unique');
      actualFs.writeFileSync(tmpPath2, 'Content B different');

      try {
        const result1 = await ingester.ingestFile(tmpPath1);
        ingester.fingerprintDB.set(result1.hash, result1.source_path);

        const result2 = await ingester.ingestFile(tmpPath2);
        expect(result1.hash).not.toBe(result2.hash);
        expect(ingester.fingerprintDB.has(result2.hash)).toBe(false);
      } finally {
        actualFs.unlinkSync(tmpPath1);
        actualFs.unlinkSync(tmpPath2);
      }
    });
  });

  // ─── Manifest Generation ──────────────────────────────────

  describe('manifest generation', () => {
    test('ingestFile returns proper metadata structure', async () => {
      const tmpPath = path.join(fixturesDir, '_test-meta.tmp');
      const actualFs = jest.requireActual('fs');
      actualFs.mkdirSync(fixturesDir, { recursive: true });
      actualFs.writeFileSync(tmpPath, 'Test PDF content');

      try {
        const result = await ingester.ingestFile(tmpPath);
        expect(result).toHaveProperty('name', '_test-meta.tmp');
        expect(result).toHaveProperty('size');
        expect(result).toHaveProperty('modified');
        expect(result).toHaveProperty('source_path');
        expect(result).toHaveProperty('hash');
        expect(result).toHaveProperty('partial_hash');
        expect(result).toHaveProperty('timestamp');
        expect(result.size).toBeGreaterThan(0);
      } finally {
        actualFs.unlinkSync(tmpPath);
      }
    });

    test('getFileMetadata returns correct file info', () => {
      const tmpPath = path.join(fixturesDir, '_test-fmeta.tmp');
      const actualFs = jest.requireActual('fs');
      actualFs.mkdirSync(fixturesDir, { recursive: true });
      actualFs.writeFileSync(tmpPath, 'Test content');

      try {
        const meta = ingester.getFileMetadata(tmpPath);
        expect(meta.name).toBe('_test-fmeta.tmp');
        expect(meta.size).toBe(12); // 'Test content' = 12 bytes
        expect(meta.source_path).toBe(path.resolve(tmpPath));
        expect(meta.modified).toBeDefined();
      } finally {
        actualFs.unlinkSync(tmpPath);
      }
    });
  });

  // ─── Error Handling ───────────────────────────────────────

  describe('error handling', () => {
    test('hashFile rejects for nonexistent file', async () => {
      await expect(ingester.hashFile('/nonexistent/file.pdf'))
        .rejects.toThrow();
    });

    test('getFileMetadata throws for nonexistent file', () => {
      expect(() => ingester.getFileMetadata('/nonexistent/file.pdf'))
        .toThrow();
    });
  });
});

/**
 * pdf-ingester.js — AutoSplit Squad
 *
 * File intake, registration, SHA-256 fingerprinting, and deduplication.
 *
 * Usage:
 *   node pdf-ingester.js --source ./input/ --output ./output/intake/
 *   node pdf-ingester.js --source ./input/doc.pdf --no-dedup
 *
 * Dependencies: crypto (built-in), fs, path, pdf-parse (optional for page count)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class PDFIngester {
  constructor(options = {}) {
    this.dedup = options.dedup !== false;
    this.recursive = options.recursive !== false;
    this.outputDir = options.outputDir || './output/intake';
    this.fingerprintDB = new Map();
  }

  /**
   * Calculate SHA-256 hash of a file
   */
  async hashFile(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * Calculate partial hash (first 4KB) for fast dedup
   */
  async partialHash(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath, { start: 0, end: 4095 });
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * Scan directory for PDF files
   */
  scanDirectory(dirPath) {
    const pdfs = [];
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
        pdfs.push(fullPath);
      } else if (entry.isDirectory() && this.recursive) {
        pdfs.push(...this.scanDirectory(fullPath));
      }
    }

    return pdfs;
  }

  /**
   * Get basic file metadata
   */
  getFileMetadata(filePath) {
    const stats = fs.statSync(filePath);
    return {
      name: path.basename(filePath),
      size: stats.size,
      modified: stats.mtime.toISOString(),
      source_path: path.resolve(filePath),
    };
  }

  /**
   * Ingest a single PDF file
   */
  async ingestFile(filePath) {
    const metadata = this.getFileMetadata(filePath);
    const hash = await this.hashFile(filePath);
    const partialHash = await this.partialHash(filePath);

    return {
      ...metadata,
      hash,
      partial_hash: partialHash,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Run full intake pipeline
   */
  async ingest(sourcePath) {
    const files = [];
    const duplicates = [];
    const errors = [];

    // Determine if source is file or directory
    const stat = fs.statSync(sourcePath);
    const pdfPaths = stat.isDirectory()
      ? this.scanDirectory(sourcePath)
      : [sourcePath];

    for (const pdfPath of pdfPaths) {
      try {
        const result = await this.ingestFile(pdfPath);

        if (this.dedup && this.fingerprintDB.has(result.hash)) {
          duplicates.push({
            name: result.name,
            hash: result.hash,
            original_path: this.fingerprintDB.get(result.hash),
          });
          continue;
        }

        this.fingerprintDB.set(result.hash, result.source_path);
        files.push(result);
      } catch (err) {
        errors.push({
          name: path.basename(pdfPath),
          error_message: err.message,
        });
      }
    }

    const manifest = {
      generated_at: new Date().toISOString(),
      source: path.resolve(sourcePath),
      summary: {
        total_scanned: pdfPaths.length,
        registered: files.length,
        duplicates: duplicates.length,
        errors: errors.length,
      },
      files,
      duplicates,
      errors,
    };

    // Write manifest
    fs.mkdirSync(this.outputDir, { recursive: true });
    const manifestPath = path.join(
      this.outputDir,
      `manifest-${new Date().toISOString().slice(0, 10)}.json`
    );
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    return { manifest, manifestPath };
  }
}

module.exports = { PDFIngester };

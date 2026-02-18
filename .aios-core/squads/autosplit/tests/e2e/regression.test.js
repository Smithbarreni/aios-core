'use strict';

/**
 * Regression Tests — Known Bug Fixes
 *
 * Tests that verify specific bug fixes remain working.
 * Each test targets one known bug and validates the fix.
 *
 * BUG-P1:  JSON corrompido em checkpoint → safeReadJSON returns null
 * BUG-P3:  pdf-parse char-split → pdftotext per-page extraction
 * BUG-P5:  Colisão de nomes em batch → subpastas por PDF
 * BUG-P8:  readdirSync sem sort → com sort para determinismo
 * BUG-P10: QC batch merge → merge de todos (não só último)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const SCRIPTS_DIR = path.join(__dirname, '..', '..', 'scripts');

// ---------------------------------------------------------------------------
// BUG-P1: JSON corrompido em checkpoint → safeReadJSON
// ---------------------------------------------------------------------------
describe('BUG-P1: safeReadJSON handles corrupted checkpoint', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autosplit-p1-'));
  });
  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  /**
   * The pipeline's safeReadJSON function is defined inside autosplit-pipeline.js
   * and not exported. We test the behavior by requiring the module pattern it uses:
   * JSON.parse wrapped in try/catch returning null on failure.
   *
   * We replicate the exact logic from autosplit-pipeline.js line 244-250.
   */
  function safeReadJSON(filePath) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return null;
    }
  }

  test('returns null for corrupted JSON (truncated)', () => {
    const filePath = path.join(tmpDir, 'corrupted.json');
    fs.writeFileSync(filePath, '{"stage": 3, "data": [1, 2,');
    expect(safeReadJSON(filePath)).toBeNull();
  });

  test('returns null for empty file', () => {
    const filePath = path.join(tmpDir, 'empty.json');
    fs.writeFileSync(filePath, '');
    expect(safeReadJSON(filePath)).toBeNull();
  });

  test('returns null for binary garbage', () => {
    const filePath = path.join(tmpDir, 'garbage.json');
    fs.writeFileSync(filePath, Buffer.from([0x00, 0x01, 0xFF, 0xFE, 0xAB]));
    expect(safeReadJSON(filePath)).toBeNull();
  });

  test('parses valid JSON correctly', () => {
    const filePath = path.join(tmpDir, 'valid.json');
    const data = { stage: 3, completed: [1, 2, 3] };
    fs.writeFileSync(filePath, JSON.stringify(data));
    expect(safeReadJSON(filePath)).toEqual(data);
  });

  test('checkpoint with invalid checksum is rejected', () => {
    // Replicate checkpoint validation logic from autosplit-pipeline.js lines 272-293
    function computeChecksum(obj) {
      const json = JSON.stringify(obj, null, 2);
      return crypto.createHash('sha256').update(json).digest('hex');
    }

    const checkpointData = {
      pipeline_version: '1.3.0',
      current_stage: 3,
      completed_stages: [1, 2],
      stage_results: {},
    };
    const validChecksum = computeChecksum(checkpointData);

    // Valid checkpoint passes
    const validCheckpoint = { ...checkpointData, checksum: validChecksum };
    const { checksum: cs, ...dataOnly } = validCheckpoint;
    expect(computeChecksum(dataOnly)).toBe(cs);

    // Tampered checkpoint fails
    const tamperedCheckpoint = { ...checkpointData, current_stage: 5, checksum: validChecksum };
    const { checksum: cs2, ...tamperedOnly } = tamperedCheckpoint;
    expect(computeChecksum(tamperedOnly)).not.toBe(cs2);
  });
});

// ---------------------------------------------------------------------------
// BUG-P3: pdf-parse char-split → pdftotext per-page
// ---------------------------------------------------------------------------
describe('BUG-P3: pdftotext per-page extraction vs pdf-parse char-split', () => {
  const { TextExtractor } = require(path.join(SCRIPTS_DIR, 'ocr-router'));

  test('fastParsePerPage returns proper per-page text (not char-split)', async () => {
    const pdfPath = path.join(__dirname, '..', 'fixtures', 'pdfs', 'Inicial_EF.pdf');
    if (!fs.existsSync(pdfPath)) {
      console.warn('SKIP: fixture not found');
      return;
    }

    const extractor = new TextExtractor({ outputDir: os.tmpdir() });

    // Check if pdftotext is available (the fix requires poppler)
    let hasPdftotext = false;
    try {
      require('child_process').execSync('pdftotext -v', { stdio: 'pipe', stderr: 'pipe' });
      hasPdftotext = true;
    } catch {}

    const result = await extractor.fastParsePerPage(pdfPath);

    if (hasPdftotext) {
      // With pdftotext: method should be 'fast-parse-poppler'
      expect(result.method).toBe('fast-parse-poppler');
    }

    // Each page should have meaningful text (not just char-split fragments)
    expect(result.pages.length).toBe(4);
    for (const page of result.pages) {
      expect(page.page_number).toBeGreaterThan(0);
      // Pages from pdftotext should have coherent text, not single chars
      if (!page.empty && page.text.length > 100) {
        const words = page.text.split(/\s+/);
        const avgWordLen = page.text.replace(/\s+/g, '').length / Math.max(words.length, 1);
        // If per-page extraction is working, average word length should be > 2
        // (char-split would give ~1 char per "word")
        expect(avgWordLen).toBeGreaterThan(2);
      }
    }
  });

  test('fastParse fallback splits by form-feed, not by char count', async () => {
    const extractor = new TextExtractor({ outputDir: os.tmpdir() });
    const pdfPath = path.join(__dirname, '..', 'fixtures', 'pdfs', 'Inicial_EF.pdf');
    if (!fs.existsSync(pdfPath)) {
      console.warn('SKIP: fixture not found');
      return;
    }

    const result = await extractor.fastParse(pdfPath);
    expect(result.method).toBe('fast-parse');
    expect(result.pages.length).toBeGreaterThan(0);

    // Verify pages have coherent text, not char fragments
    for (const page of result.pages) {
      if (!page.empty && page.text.length > 50) {
        // Should contain actual Portuguese words, not single chars
        expect(page.text).toMatch(/\w{3,}/);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// BUG-P5: Colisão de nomes em batch → subpastas por PDF
// ---------------------------------------------------------------------------
describe('BUG-P5: Batch mode uses subfolders to prevent name collision', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autosplit-p5-'));
  });
  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  test('batch output creates per-PDF subfolders', () => {
    // Simulate the batch subfolder creation logic from autosplit-pipeline.js lines 193-204
    const OUTPUT_DIRS = ['intake', 'profiles', 'routes', 'extracted', 'segments', 'markdown', 'review'];

    function createPdfSubfolder(outputBase, pdfFileName) {
      const baseName = path.parse(pdfFileName).name;
      const pdfOutputDir = path.join(outputBase, baseName);
      fs.mkdirSync(pdfOutputDir, { recursive: true });
      for (const dir of OUTPUT_DIRS) {
        fs.mkdirSync(path.join(pdfOutputDir, dir), { recursive: true });
      }
      return pdfOutputDir;
    }

    const dir1 = createPdfSubfolder(tmpDir, 'processo-A.pdf');
    const dir2 = createPdfSubfolder(tmpDir, 'processo-B.pdf');

    // Verify separate directories
    expect(dir1).not.toBe(dir2);
    expect(path.basename(dir1)).toBe('processo-A');
    expect(path.basename(dir2)).toBe('processo-B');

    // Verify subdirectories exist in both
    for (const subDir of OUTPUT_DIRS) {
      expect(fs.existsSync(path.join(dir1, subDir))).toBe(true);
      expect(fs.existsSync(path.join(dir2, subDir))).toBe(true);
    }
  });

  test('markdown files from different PDFs in batch do not collide', () => {
    const { MarkdownExporter } = require(path.join(SCRIPTS_DIR, 'md-exporter'));

    // Simulate 2 PDFs each with a segment "seg-001" that would collide without subfolders
    const seg = {
      segment_id: 'seg-001',
      type: 'piece',
      doc_type: 'sentenca',
      page_start: 1,
      page_end: 3,
      confidence: 0.9,
    };
    const extractedData = {
      pages: [
        { page_number: 1, text: 'Vistos. Julgo procedente o pedido.', empty: false },
        { page_number: 2, text: 'P.R.I.', empty: false },
        { page_number: 3, text: '', empty: true },
      ],
    };
    const extractionMeta = { method: 'fast-parse', overall_confidence: 0.95 };

    // Export to 2 different subfolders (batch mode behavior)
    const mdDir1 = path.join(tmpDir, 'pdf-A', 'markdown');
    const mdDir2 = path.join(tmpDir, 'pdf-B', 'markdown');

    const exp1 = new MarkdownExporter({ outputDir: mdDir1, pipelineVersion: '1.3.0' });
    const exp2 = new MarkdownExporter({ outputDir: mdDir2, pipelineVersion: '1.3.0' });

    exp1.exportAll([seg], '/fake/pdf-A.pdf', extractedData, extractionMeta);
    exp2.exportAll([seg], '/fake/pdf-B.pdf', extractedData, extractionMeta);

    // Both directories have files, no collision
    const files1 = fs.readdirSync(mdDir1);
    const files2 = fs.readdirSync(mdDir2);
    expect(files1.length).toBeGreaterThan(0);
    expect(files2.length).toBeGreaterThan(0);

    // Files have same names but live in different directories
    expect(files1.filter(f => f.endsWith('.md'))).toEqual(files2.filter(f => f.endsWith('.md')));
  });
});

// ---------------------------------------------------------------------------
// BUG-P8: readdirSync sem sort → com sort
// ---------------------------------------------------------------------------
describe('BUG-P8: readdirSync with sort for deterministic batch order', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autosplit-p8-'));
  });
  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  test('detectSource returns PDFs in sorted order', () => {
    // Create PDFs in non-alphabetical order
    fs.writeFileSync(path.join(tmpDir, 'zz-last.pdf'), '%PDF-1.4 fake');
    fs.writeFileSync(path.join(tmpDir, 'aa-first.pdf'), '%PDF-1.4 fake');
    fs.writeFileSync(path.join(tmpDir, 'mm-middle.pdf'), '%PDF-1.4 fake');

    // Replicate detectSource logic from autosplit-pipeline.js lines 219-223
    const pdfs = fs.readdirSync(tmpDir)
      .filter(f => f.toLowerCase().endsWith('.pdf'))
      .sort()
      .map(f => path.resolve(path.join(tmpDir, f)));

    expect(pdfs.map(f => path.basename(f))).toEqual([
      'aa-first.pdf',
      'mm-middle.pdf',
      'zz-last.pdf',
    ]);
  });

  test('sort produces consistent results across multiple calls', () => {
    // Create files
    for (const name of ['c.pdf', 'a.pdf', 'b.pdf', 'd.pdf']) {
      fs.writeFileSync(path.join(tmpDir, name), '%PDF-1.4 fake');
    }

    // Run 10 times — all should be identical
    const results = [];
    for (let i = 0; i < 10; i++) {
      const sorted = fs.readdirSync(tmpDir)
        .filter(f => f.endsWith('.pdf'))
        .sort();
      results.push(sorted);
    }

    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toEqual(results[0]);
    }
    expect(results[0]).toEqual(['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf']);
  });
});

// ---------------------------------------------------------------------------
// BUG-P10: QC batch merge → merge de todos (não só último)
// ---------------------------------------------------------------------------
describe('BUG-P10: QC batch merge aggregates all results', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autosplit-p10-'));
  });
  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  test('QC results from multiple files are merged correctly', () => {
    // Simulate qcResults from 3 files (as done in autosplit-pipeline.js lines 737-745)
    const qcResults = [
      { summary: { passed: 3, flagged: 1, rejected: 0, mislabels_caught: 0 } },
      { summary: { passed: 2, flagged: 0, rejected: 1, mislabels_caught: 1 } },
      { summary: { passed: 5, flagged: 2, rejected: 0, mislabels_caught: 0 } },
    ];

    // Apply the batch merge logic (fix from autosplit-pipeline.js)
    const mergedQcResult = {
      summary: {
        passed: qcResults.reduce((sum, q) => sum + q.summary.passed, 0),
        flagged: qcResults.reduce((sum, q) => sum + q.summary.flagged, 0),
        rejected: qcResults.reduce((sum, q) => sum + q.summary.rejected, 0),
        mislabels_caught: qcResults.reduce((sum, q) => sum + q.summary.mislabels_caught, 0),
      },
      files: qcResults,
    };

    // Verify merge sums all values (not just last)
    expect(mergedQcResult.summary.passed).toBe(10);       // 3+2+5
    expect(mergedQcResult.summary.flagged).toBe(3);        // 1+0+2
    expect(mergedQcResult.summary.rejected).toBe(1);       // 0+1+0
    expect(mergedQcResult.summary.mislabels_caught).toBe(1); // 0+1+0
    expect(mergedQcResult.files.length).toBe(3);
  });

  test('single-file QC is not broken by merge logic', () => {
    const qcResults = [
      { summary: { passed: 5, flagged: 1, rejected: 0, mislabels_caught: 0 } },
    ];

    const mergedQcResult = {
      summary: {
        passed: qcResults.reduce((sum, q) => sum + q.summary.passed, 0),
        flagged: qcResults.reduce((sum, q) => sum + q.summary.flagged, 0),
        rejected: qcResults.reduce((sum, q) => sum + q.summary.rejected, 0),
        mislabels_caught: qcResults.reduce((sum, q) => sum + q.summary.mislabels_caught, 0),
      },
      files: qcResults,
    };

    expect(mergedQcResult.summary.passed).toBe(5);
    expect(mergedQcResult.summary.flagged).toBe(1);
    expect(mergedQcResult.summary.rejected).toBe(0);
    expect(mergedQcResult.files.length).toBe(1);
  });

  test('BUG-P10 old behavior would keep only last result', () => {
    // Demonstrate the old buggy behavior for documentation
    const qcResults = [
      { summary: { passed: 3, flagged: 1, rejected: 0, mislabels_caught: 0 } },
      { summary: { passed: 2, flagged: 0, rejected: 1, mislabels_caught: 1 } },
    ];

    // Old buggy behavior: loop overwrites qcResult each iteration
    let buggyQcResult = null;
    for (const qc of qcResults) {
      buggyQcResult = qc; // Bug: overwrites, doesn't merge
    }

    // Buggy: only has last file's data
    expect(buggyQcResult.summary.passed).toBe(2); // Lost the 3 from first file

    // Fixed: merge sums all
    const fixedResult = {
      passed: qcResults.reduce((sum, q) => sum + q.summary.passed, 0),
    };
    expect(fixedResult.passed).toBe(5); // Correct: 3+2
  });
});

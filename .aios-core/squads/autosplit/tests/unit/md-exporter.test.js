/**
 * md-exporter.test.js — Unit tests for MarkdownExporter
 *
 * 6 tests:
 *   - YAML frontmatter generation (2)
 *   - File naming convention (2)
 *   - index.json generation (2)
 */

const fs = require('fs');
const path = require('path');
const { MarkdownExporter } = require('../../scripts/md-exporter');

// Mock fs for controlled testing
jest.mock('fs', () => ({
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(),
  existsSync: jest.fn(() => true),
}));

describe('MarkdownExporter', () => {
  let exporter;

  beforeEach(() => {
    exporter = new MarkdownExporter({
      outputDir: '/tmp/test-export',
      pipelineVersion: '1.2.1',
    });
    jest.clearAllMocks();
  });

  // ─── YAML Frontmatter Generation ──────────────────────────

  describe('generateFrontmatter', () => {
    test('generates correct YAML frontmatter with all required fields', () => {
      const segment = {
        segment_id: 'seg-001',
        page_start: 1,
        page_end: 5,
        type: 'piece',
        doc_type: 'sentenca',
        confidence: 0.9,
      };
      const extractionMeta = { method: 'fast-parse', overall_confidence: 0.95 };

      const fm = exporter.generateFrontmatter(segment, '/path/to/doc.pdf', extractionMeta);
      expect(fm).toContain('---');
      expect(fm).toContain('segment_id: "seg-001"');
      expect(fm).toContain('source_pdf: "doc.pdf"');
      expect(fm).toContain('page_range: "1-5"');
      expect(fm).toContain('total_pages: 5');
      expect(fm).toContain('doc_type: "sentenca"');
      expect(fm).toContain('segmentation_confidence: 0.9');
      expect(fm).toContain('extraction_method: "fast-parse"');
      expect(fm).toContain('pipeline_version: "1.2.1"');
    });

    test('includes fallback_triggered when true', () => {
      const segment = {
        segment_id: 'seg-002',
        page_start: 6,
        page_end: 8,
        type: 'piece',
        doc_type: 'despacho',
        confidence: 0.7,
      };
      const extractionMeta = { method: 'ocr-standard', overall_confidence: 0.8, fallback_triggered: true };

      const fm = exporter.generateFrontmatter(segment, '/path/to/doc.pdf', extractionMeta);
      expect(fm).toContain('fallback_triggered: true');
    });
  });

  // ─── File Naming Convention ───────────────────────────────

  describe('generateFilename', () => {
    test('generates filename with zero-padded index, type, and doc_type', () => {
      const segment = { type: 'piece', doc_type: 'sentenca' };
      const filename = exporter.generateFilename(segment, 0);
      expect(filename).toBe('001-piece-sentenca.md');
    });

    test('pads index correctly for double-digit segments', () => {
      const segment = { type: 'attachment', doc_type: 'attachment' };
      const filename = exporter.generateFilename(segment, 11);
      expect(filename).toBe('012-attachment-attachment.md');
    });
  });

  // ─── index.json Generation ────────────────────────────────

  describe('exportAll', () => {
    test('generates index.json with correct structure', () => {
      const segments = [
        { segment_id: 'seg-001', type: 'piece', doc_type: 'peticao', page_start: 1, page_end: 3, confidence: 0.85 },
        { segment_id: 'seg-002', type: 'piece', doc_type: 'sentenca', page_start: 4, page_end: 6, confidence: 0.9 },
      ];
      const extractedData = {
        pages: [
          { page_number: 1, text: 'Petição inicial texto', empty: false },
          { page_number: 2, text: 'Continuação', empty: false },
          { page_number: 3, text: 'Final petição', empty: false },
          { page_number: 4, text: 'Sentença texto', empty: false },
          { page_number: 5, text: 'Fundamentação', empty: false },
          { page_number: 6, text: 'Dispositivo', empty: false },
        ],
      };
      const extractionMeta = { method: 'fast-parse', overall_confidence: 0.95 };

      const result = exporter.exportAll(segments, '/path/to/doc.pdf', extractedData, extractionMeta);

      expect(result.files).toHaveLength(2);
      expect(result.indexPath).toBe('/tmp/test-export/index.json');

      // Verify writeFileSync was called for 2 MD files + 1 index.json = 3 calls
      expect(fs.writeFileSync).toHaveBeenCalledTimes(3);

      // Verify index.json content
      const indexCall = fs.writeFileSync.mock.calls.find(c => c[0].endsWith('index.json'));
      expect(indexCall).toBeDefined();
      const indexData = JSON.parse(indexCall[1]);
      expect(indexData.source_pdf).toBe('doc.pdf');
      expect(indexData.total_segments).toBe(2);
      expect(indexData.total_pages).toBe(6);
      expect(indexData.pipeline_version).toBe('1.2.1');
      expect(indexData.files).toHaveLength(2);
    });

    test('buildBody returns manual review note for empty page range', () => {
      const body = exporter.buildBody([], 1, 5);
      expect(body).toContain('requer revisao manual');
    });
  });
});

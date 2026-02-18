/**
 * qc-validator.test.js — Unit tests for QCValidator
 *
 * 8 tests:
 *   - Mislabel detection patterns (5)
 *   - Page coverage analysis (2)
 *   - Gap detection (1)
 */

const { QCValidator } = require('../../scripts/qc-validator');

// Mock fs — only for methods that read/write files
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    mkdirSync: jest.fn(),
    copyFileSync: jest.fn(),
  };
});

describe('QCValidator', () => {
  let validator;

  beforeEach(() => {
    validator = new QCValidator();
    jest.clearAllMocks();
  });

  // ─── Mislabel Detection Patterns ──────────────────────────

  describe('checkMislabel', () => {
    test('sentenca: rejects when body lacks "julgo/procedente"', () => {
      const body = 'Este documento trata de um ofício encaminhado ao delegado.';
      const result = validator.checkMislabel('sentenca', body);
      expect(result).not.toBeNull();
      expect(result.severity).toBe('REJECT');
      expect(result.check).toBe('mislabel');
    });

    test('sentenca: passes when body contains "julgo procedente"', () => {
      const body = 'Ante o exposto, julgo procedente o pedido formulado na inicial.';
      const result = validator.checkMislabel('sentenca', body);
      expect(result).toBeNull();
    });

    test('peticao-inicial: rejects when body lacks "excelentissimo/requer"', () => {
      const body = 'Certidão de trânsito em julgado.';
      const result = validator.checkMislabel('peticao-inicial', body);
      expect(result).not.toBeNull();
      expect(result.severity).toBe('REJECT');
    });

    test('acordao: passes when body contains "acordam" or "desembargador"', () => {
      const body = 'ACORDAM os Desembargadores da 3ª Turma em dar provimento ao recurso.';
      const result = validator.checkMislabel('acordao', body);
      expect(result).toBeNull();
    });

    test('returns null for doc_type without mislabel rule', () => {
      const body = 'Qualquer texto aqui.';
      const result = validator.checkMislabel('attachment', body);
      expect(result).toBeNull();
    });
  });

  // ─── Page Coverage Analysis ───────────────────────────────

  describe('validatePageRanges', () => {
    test('detects page overlap between segments', () => {
      const indexData = {
        total_pages: 10,
        files: [
          { file: '001-piece-peticao.md', pages: '1-5' },
          { file: '002-piece-sentenca.md', pages: '4-8' }, // overlap on page 4-5
        ],
      };
      const issues = validator.validatePageRanges(indexData);
      const overlaps = issues.filter(i => i.check === 'page-overlap');
      expect(overlaps.length).toBeGreaterThan(0);
      expect(overlaps[0].severity).toBe('REJECT');
    });

    test('no issues when pages are contiguous without overlap', () => {
      const indexData = {
        total_pages: 10,
        files: [
          { file: '001-piece-peticao.md', pages: '1-5' },
          { file: '002-piece-sentenca.md', pages: '6-10' },
        ],
      };
      const issues = validator.validatePageRanges(indexData);
      expect(issues).toHaveLength(0);
    });
  });

  // ─── Gap Detection ────────────────────────────────────────

  describe('validatePageRanges — gap detection', () => {
    test('detects gaps in page coverage', () => {
      const indexData = {
        total_pages: 10,
        files: [
          { file: '001-piece-peticao.md', pages: '1-3' },
          { file: '002-piece-sentenca.md', pages: '7-10' },
          // Pages 4-6 are missing
        ],
      };
      const issues = validator.validatePageRanges(indexData);
      const gaps = issues.filter(i => i.check === 'page-gap');
      expect(gaps.length).toBe(3); // pages 4, 5, 6
      expect(gaps[0].severity).toBe('FLAG');
    });
  });
});

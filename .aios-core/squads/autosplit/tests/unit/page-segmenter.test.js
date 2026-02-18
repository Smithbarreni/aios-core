/**
 * page-segmenter.test.js — Unit tests for PageSegmenter
 *
 * 15 tests:
 *   - 11 boundary patterns (1 test each)
 *   - 4 edge cases
 */

const { PageSegmenter } = require('../../scripts/page-segmenter');

describe('PageSegmenter', () => {
  let segmenter;

  beforeEach(() => {
    segmenter = new PageSegmenter();
  });

  // ─── 11 Boundary Patterns (1 test each) ────────────────────

  describe('detectBoundaries — boundary patterns', () => {
    test('court-header: detects "Poder Judiciário"', () => {
      const text = 'PODER JUDICIÁRIO\nTribunal Regional Federal da 3ª Região\nProcesso nº 12345';
      const markers = segmenter.detectBoundaries(text, 1);
      expect(markers.some(m => m.rule === 'court-header')).toBe(true);
    });

    test('court-header: detects "Tribunal de Justiça"', () => {
      const text = 'TRIBUNAL DE JUSTIÇA DO ESTADO DE SÃO PAULO\nSeção de Direito Público';
      const markers = segmenter.detectBoundaries(text, 1);
      expect(markers.some(m => m.rule === 'court-header')).toBe(true);
    });

    test('court-header: detects "Justiça Federal"', () => {
      const text = 'JUSTIÇA FEDERAL\nSubseção Judiciária de São Paulo\nProcesso 0001234-56.2020.4.03.6100';
      const markers = segmenter.detectBoundaries(text, 1);
      expect(markers.some(m => m.rule === 'court-header')).toBe(true);
    });

    test('petition-start: detects "Excelentíssimo Senhor Juiz"', () => {
      const text = 'EXCELENTÍSSIMO SENHOR JUIZ FEDERAL DA 1ª VARA\nProcesso nº 12345';
      const markers = segmenter.detectBoundaries(text, 1);
      expect(markers.some(m => m.rule === 'petition-start')).toBe(true);
    });

    test('petition-start: detects "EXMO. SR. DR. JUIZ"', () => {
      const text = 'EXMO. SR. DR. JUIZ FEDERAL DA 3ª VARA\nAutos nº 0001234-56.2020';
      const markers = segmenter.detectBoundaries(text, 2);
      expect(markers.some(m => m.rule === 'petition-start')).toBe(true);
    });

    test('sentence-start: detects "SENTENÇA"', () => {
      const text = 'SENTENÇA\nVistos, etc.\nTrata-se de ação ordinária';
      const markers = segmenter.detectBoundaries(text, 5);
      expect(markers.some(m => m.rule === 'sentence-start')).toBe(true);
    });

    test('acordao-start: detects "ACÓRDÃO"', () => {
      const text = 'ACÓRDÃO\nVistos e relatados estes autos\nACORDAM os Desembargadores';
      const markers = segmenter.detectBoundaries(text, 10);
      expect(markers.some(m => m.rule === 'acordao-start')).toBe(true);
    });

    test('certidao-start: detects "CERTIDÃO ... certifico" on same line', () => {
      // The regex requires certidão and certifico on the SAME heading line
      // because _extractHeading joins with \n and .* doesn't cross newlines
      const text = 'CERTIDÃO — Certifico e dou fé que os presentes autos transitaram';
      const markers = segmenter.detectBoundaries(text, 15);
      expect(markers.some(m => m.rule === 'certidao-start')).toBe(true);
    });

    test('despacho: detects "DESPACHO"', () => {
      const text = 'DESPACHO\nCite-se a parte ré para contestar no prazo legal.';
      const markers = segmenter.detectBoundaries(text, 3);
      expect(markers.some(m => m.rule === 'despacho')).toBe(true);
    });

    test('decisao: detects "DECISÃO INTERLOCUTÓRIA"', () => {
      const text = 'DECISÃO INTERLOCUTÓRIA\nDefiro o pedido de tutela de urgência.';
      const markers = segmenter.detectBoundaries(text, 7);
      expect(markers.some(m => m.rule === 'decisao')).toBe(true);
    });

    test('oficio: detects "OFÍCIO N"', () => {
      const text = 'OFÍCIO Nº 123/2024\nSenhor Delegado da Receita Federal';
      const markers = segmenter.detectBoundaries(text, 20);
      expect(markers.some(m => m.rule === 'oficio')).toBe(true);
    });
  });

  // ─── 4 Edge Cases ─────────────────────────────────────────

  describe('detectBoundaries — edge cases', () => {
    test('blank page detected as blank-page marker', () => {
      const text = '';
      const markers = segmenter.detectBoundaries(text, 5);
      expect(markers.some(m => m.rule === 'blank-page')).toBe(true);
    });

    test('body-text reference does NOT trigger boundary (heading-only matching)', () => {
      // "sentença" appears in body (line 5+), NOT in heading
      const text = 'Relatório Final do Perito\nJosé da Silva — Perito Judicial\nMatrícula 12345\n' +
        'Trata-se de perícia técnica.\n' +
        'Conforme a sentença de fls. 45, o réu foi condenado.\n' +
        'Devemos considerar o acórdão proferido pelo TRF.';
      const markers = segmenter.detectBoundaries(text, 8);
      // Should NOT detect sentence-start since "sentença" is NOT in heading
      expect(markers.some(m => m.rule === 'sentence-start')).toBe(false);
    });

    test('PJe system blocks are stripped before boundary detection', () => {
      // PJe pagination appears before real content
      const text = 'Num. 12345 - Pág. 1\nAssinado eletronicamente por: Dr. Juiz\n' +
        'Este documento foi gerado pelo usuário FULANO\n' +
        'SENTENÇA\nVistos, etc.';
      const markers = segmenter.detectBoundaries(text, 1);
      expect(markers.some(m => m.rule === 'sentence-start')).toBe(true);
    });

    test('segment() with empty pages returns empty array', () => {
      const result = segmenter.segment({ pages: [] });
      expect(result).toEqual([]);
    });
  });

  // ─── Segmentation Integration ─────────────────────────────

  describe('segment', () => {
    test('segments document into multiple pieces at boundary markers', () => {
      const extractedData = {
        pages: [
          { page_number: 1, text: 'EXCELENTÍSSIMO SENHOR JUIZ FEDERAL\nRequer a citação do réu.' },
          { page_number: 2, text: 'Continuação da petição inicial com fundamentação jurídica.' },
          { page_number: 3, text: 'SENTENÇA\nVistos, etc. Julgo procedente o pedido.' },
          { page_number: 4, text: 'DESPACHO\nCite-se a parte ré no prazo de 15 dias.' },
        ],
      };

      const segments = segmenter.segment(extractedData);
      expect(segments.length).toBeGreaterThanOrEqual(3);
      // First segment should be petition
      expect(segments[0].doc_type).toBe('peticao');
      expect(segments[1].doc_type).toBe('sentenca');
      expect(segments[2].doc_type).toBe('despacho');
    });
  });
});

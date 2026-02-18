/**
 * quality-profiler.test.js — Unit tests for QualityProfiler & DocumentClassifier
 *
 * 12 tests:
 *   - 7 garbage detection signals
 *   - 1 PJe footer strip
 *   - 4 quality tier classification
 */

const { QualityProfiler, DocumentClassifier } = require('../../scripts/quality-profiler');

describe('QualityProfiler', () => {
  let profiler;

  beforeEach(() => {
    profiler = new QualityProfiler();
  });

  // ─── 7 Garbage Detection Signals ───────────────────────────

  describe('detectWordLevelGarbage', () => {
    test('Signal 1: short fragment ratio — high ratio of 1-2 char words', () => {
      // >45% of words are 1-2 chars → signals += 2
      const garbage = 'a b c d e f g h i j k l m n o p q r s t real word here';
      const score = profiler.detectWordLevelGarbage(garbage);
      expect(score).toBeGreaterThan(0);
    });

    test('Signal 2: punctuation-as-word ratio — words mostly non-alphanumeric', () => {
      // Words that are >60% punctuation
      const garbage = 'normal ..:: ;;-- ==++ ~~## $$%% &&** !!?? @@^^ more normal text here some padding words needed';
      const score = profiler.detectWordLevelGarbage(garbage);
      expect(score).toBeGreaterThan(0);
    });

    test('Signal 3: tilde/garbage operator ratio', () => {
      // >2% tilde/garbage characters
      const garbage = 'texto~com~muitos~tildes~e§caracteres¬especiais~em~todo~o~documento~que~aparece~assim sempre aqui temos mais';
      const score = profiler.detectWordLevelGarbage(garbage);
      expect(score).toBeGreaterThan(0);
    });

    test('Signal 4: low ratio of common Portuguese words', () => {
      // Text with very few common PT words
      const garbage = 'xrblk mfnzt qwpjs hvdly ctgrn bkwzf jnmpt xdlrs vbcfg hwkzm nplrt sdvbx cjfmw qptlr zxnbv';
      const score = profiler.detectWordLevelGarbage(garbage);
      expect(score).toBeGreaterThan(0.3);
    });

    test('Signal 5: broken word patterns — consecutive consonants', () => {
      // 4+ consecutive consonants, unusual in Portuguese
      const garbage = 'FIORIACELULOSSS CNSTTT PRBLM DFKLM normal texto aqui para preencher o documento todo com palavras falsas igualmente';
      const score = profiler.detectWordLevelGarbage(garbage);
      expect(score).toBeGreaterThan(0);
    });

    test('Signal 6: encoding corruption — tilde/dash/equals inside words', () => {
      // Garbled PDF text encoding
      const garbage = 'staR~vIço D~vol CONSTTI=0 pr0c3ss0 r~gistro f~deral aqui temos mais palavras para completar o texto todo garbled';
      const score = profiler.detectWordLevelGarbage(garbage);
      expect(score).toBeGreaterThan(0);
    });

    test('Signal 7: dictionary miss rate — words not in PT_COMMON_WORDS', () => {
      // All long words are gibberish (not in dictionary)
      const garbage = 'xrblkfg mfnztdp qwpjslm hvdlycr ctgrnbk bkwzfnm jnmptxr xdlrsvc vbcfghw hwkzmnt nplrtsd sdvbxcj cjfmwqp qptlrzx';
      const score = profiler.detectWordLevelGarbage(garbage);
      expect(score).toBeGreaterThan(0.3);
    });
  });

  // ─── PJe Footer Strip ────────────────────────────────────

  describe('stripPJeFooter', () => {
    test('strips PJe electronic signature footer from end of text', () => {
      // Footer must be in the last 40% of the text for stripPJeFooter to remove it.
      // Build enough body content so the footer falls in the last 40%.
      const bodyLines = [];
      for (let i = 0; i < 20; i++) {
        bodyLines.push(`Linha ${i + 1} do conteúdo real da página com decisão do juiz e fundamentação legal detalhada.`);
      }
      const body = bodyLines.join('\n');
      const text = body + '\n' +
        'Este documento foi gerado pelo usuário FULANO em 01/01/2024.\n' +
        'Número do documento: 12345678\n' +
        'Assinado eletronicamente por: Dr. Juiz';

      const result = profiler.stripPJeFooter(text);
      expect(result).not.toContain('Este documento foi gerado');
      expect(result).toContain('Linha 1 do conteúdo real');
    });
  });

  // ─── Quality Tier Classification ──────────────────────────

  describe('getQualityTier', () => {
    test('tier A: readability >= 80', () => {
      expect(profiler.getQualityTier(85)).toBe('A');
      expect(profiler.getQualityTier(100)).toBe('A');
    });

    test('tier B: readability 60-79', () => {
      expect(profiler.getQualityTier(60)).toBe('B');
      expect(profiler.getQualityTier(79)).toBe('B');
    });

    test('tier C: readability 40-59', () => {
      expect(profiler.getQualityTier(40)).toBe('C');
      expect(profiler.getQualityTier(59)).toBe('C');
    });

    test('tier D/F: readability < 40', () => {
      expect(profiler.getQualityTier(20)).toBe('D');
      expect(profiler.getQualityTier(19)).toBe('F');
      expect(profiler.getQualityTier(0)).toBe('F');
    });
  });
});

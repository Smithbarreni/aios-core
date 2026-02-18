/**
 * page-segmenter.js — AutoSplit Squad
 *
 * Page-level content segmentation and boundary detection.
 * Identifies where one procedural piece ends and another begins.
 *
 * Usage:
 *   node page-segmenter.js --input ./output/extracted/doc-extracted.json
 *
 * Dependencies: none (pure JS heuristics)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class PageSegmenter {
  constructor(options = {}) {
    this.outputDir = options.outputDir || './output/segments';
    this.boundaryRules = this._buildBoundaryRules();
  }

  /**
   * Build boundary detection rules with weights.
   * These patterns are tested ONLY against page headings (first meaningful lines),
   * NOT the full page body. This prevents false positives from inline references
   * (e.g., a petition that MENTIONS "decisão" in its arguments).
   */
  _buildBoundaryRules() {
    return [
      {
        name: 'court-header',
        pattern: /poder\s+judici[aá]rio|tribunal\s+de\s+justi[cç]a|justi[cç]a\s+(federal|estadual|do\s+trabalho)/i,
        weight: 0.9,
        description: 'Court header or seal detected',
      },
      {
        name: 'petition-start',
        // Matches both full form and abbreviation: "Excelentíssimo Senhor Juiz" / "EXMO. SR. DR. JUIZ"
        pattern: /(?:excelent[ií]ssim[oa]|exm[oa]\.?)\s+s(?:enhor[a]?|r\.?)\s+(?:d(?:outor[a]?|r\.?)\s+)?(?:juiz|ju[ií]z[a]?|desembargador)/i,
        weight: 0.85,
        description: 'Petition opening formula',
      },
      {
        name: 'sentence-start',
        pattern: /\bsenten[cç]a\b/i,
        weight: 0.9,
        description: 'Sentence header',
      },
      {
        name: 'acordao-start',
        pattern: /\bac[oó]rd[aã][om]\b/i,
        weight: 0.9,
        description: 'Acordao header',
      },
      {
        name: 'certidao-start',
        pattern: /\bcertid[aã]o\b.*\bcertifico/i,
        weight: 0.8,
        description: 'Certidao header',
      },
      {
        name: 'attachment-label',
        pattern: /\b(anexo\s+[IVX\d]|documento\s+n)/i,
        weight: 0.75,
        description: 'Attachment or exhibit label',
      },
      {
        name: 'process-number',
        pattern: /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/,
        weight: 0.6,
        description: 'CNJ process number format',
      },
      {
        name: 'despacho',
        pattern: /\bdespacho\b/i,
        weight: 0.7,
        description: 'Despacho header',
      },
      {
        name: 'decisao',
        pattern: /\bdecis[aã]o\s*(interlocut[oó]ria)?/i,
        weight: 0.75,
        description: 'Decision header',
      },
      {
        name: 'oficio',
        pattern: /\bof[ií]cio\s+n/i,
        weight: 0.7,
        description: 'Oficio header',
      },
    ];
  }

  /**
   * Strip PJe electronic system blocks from page text.
   * PJe inserts repeated header/footer blocks (pagination, digital signatures, URLs)
   * at every page boundary inside the PDF. These are system chrome, not document content,
   * and must be removed before boundary detection to prevent false positives.
   */
  _stripPJeBlocks(text) {
    if (!text) return '';

    // Remove complete PJe blocks: "Num. XXXXX - Pág. N" through "Este documento foi gerado..."
    let cleaned = text.replace(
      /Num\.\s*\d+\s*-\s*P[áa]g\.\s*\d+[\s\S]*?Este documento foi gerado[^\n]*/gi,
      '\n'
    );

    // Remove standalone PJe lines that may remain outside full blocks
    cleaned = cleaned.replace(/^Assinado eletronicamente[^\n]*/gim, '');
    cleaned = cleaned.replace(/^https?:\/\/pje\d?g?\.[\S]*/gim, '');
    cleaned = cleaned.replace(/^N[úu]mero do documento:[^\n]*/gim, '');
    cleaned = cleaned.replace(/^Este documento foi gerado[^\n]*/gim, '');
    cleaned = cleaned.replace(/^Num\.\s*\d+\s*-\s*P[áa]g\.\s*\d+[^\n]*/gim, '');

    // Collapse multiple blank lines
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    return cleaned.trim();
  }

  /**
   * Extract heading lines from text — first N non-empty, meaningful lines.
   * Real document boundaries (SENTENÇA, ACÓRDÃO, DESPACHO, petição opening)
   * always appear in the first 1-3 lines of their starting page.
   * Body text references ("conforme decisão de fls. 45") appear from line 4+.
   * Using 3 lines is tight but safe: court headers, sentença, acórdão, despacho,
   * petition openings are all on lines 1-2. Line 3 absorbs law firm watermark residual.
   */
  _extractHeading(text, maxLines = 3) {
    const lines = text.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 3); // skip tiny remnants
    return lines.slice(0, maxLines).join('\n');
  }

  /**
   * Extract numbered paragraph from text lines.
   * Brazilian legal documents use sequential numbered paragraphs: "09.", "15)", "23 -"
   * Used to detect document continuation across page boundaries —
   * if page N ends with paragraph K and page N+1 starts with paragraph K+1,
   * they belong to the same document regardless of keyword matches.
   *
   * @param {string} text - Page text (should be PJe-stripped)
   * @param {boolean} fromEnd - If true, find last paragraph number; else first
   * @returns {number|null}
   */
  _extractParagraphNum(text, fromEnd = false) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 3);
    // Matches "09.", "15)", "23 -" at line start, followed by space+letter
    // Excludes dates (4+ digits), monetary values, article references
    const regex = /^(\d{1,3})\s*[.)\-]\s/;

    if (fromEnd) {
      for (let i = lines.length - 1; i >= Math.max(0, lines.length - 20); i--) {
        const match = lines[i].match(regex);
        if (match) return parseInt(match[1]);
      }
    } else {
      for (let i = 0; i < Math.min(lines.length, 5); i++) {
        const match = lines[i].match(regex);
        if (match) return parseInt(match[1]);
      }
    }
    return null;
  }

  /**
   * Detect boundary markers on a single page.
   * Tests patterns ONLY against the page heading (first 3 meaningful lines after
   * stripping PJe system blocks). This prevents false positives from body text
   * that merely references other document types.
   */
  detectBoundaries(pageText, pageNumber) {
    const markers = [];

    // Step 1: Strip PJe system blocks (pagination, signatures, URLs)
    const cleanedText = this._stripPJeBlocks(pageText);

    // Step 2: Extract heading for boundary pattern matching (3 lines only)
    const heading = this._extractHeading(cleanedText, 3);

    // Step 3: Test boundary rules against heading only
    for (const rule of this.boundaryRules) {
      if (rule.pattern.test(heading)) {
        markers.push({
          rule: rule.name,
          weight: rule.weight,
          description: rule.description,
          page: pageNumber,
        });
      }
    }

    // Blank page detection uses full cleaned text (not heading)
    if (cleanedText.length < 30) {
      markers.push({
        rule: 'blank-page',
        weight: 0.7,
        description: 'Blank or near-blank separator page',
        page: pageNumber,
      });
    }

    return markers;
  }

  /**
   * Segment a document into pieces based on page-level boundaries
   */
  segment(extractedData) {
    const pages = extractedData.pages || [];
    if (pages.length === 0) return [];

    // Classification from profiler (bridged via Stage 5)
    const classification = extractedData.classification || null;

    const segments = [];
    let currentSegment = null;
    let segmentCounter = 0;
    let prevPageLastParaNum = null;

    for (const page of pages) {
      const markers = this.detectBoundaries(page.text, page.page_number);
      let isNewPiece = markers.some(m => m.weight >= 0.7 && m.rule !== 'blank-page');
      const isBlank = markers.some(m => m.rule === 'blank-page');

      // Paragraph continuation suppression:
      // If a boundary keyword was detected in heading but paragraph numbering
      // continues sequentially from previous page, the keyword is body text
      // (e.g., "decisão" mentioned narratively), not a real document boundary.
      // Only suppress for non-structural markers (weight < 0.85) — structural
      // headers (court-header, petition-start, sentence, acordao) always win.
      if (isNewPiece && currentSegment && prevPageLastParaNum !== null) {
        const hasStrongStructural = markers.some(m => m.weight >= 0.85);
        if (!hasStrongStructural) {
          const cleaned = this._stripPJeBlocks(page.text);
          const firstParaNum = this._extractParagraphNum(cleaned, false);
          if (firstParaNum !== null && firstParaNum === prevPageLastParaNum + 1) {
            isNewPiece = false;
          }
        }
      }

      // Track last paragraph number for next page's continuation check
      const cleanedForPara = this._stripPJeBlocks(page.text);
      const lastParaNum = this._extractParagraphNum(cleanedForPara, true);
      if (lastParaNum !== null) prevPageLastParaNum = lastParaNum;

      if (isNewPiece || !currentSegment) {
        // Close previous segment
        if (currentSegment) {
          segments.push(currentSegment);
        }

        segmentCounter++;
        const segType = this._inferSegmentType(markers, classification);

        currentSegment = {
          segment_id: `seg-${String(segmentCounter).padStart(3, '0')}`,
          type: segType.type,
          doc_type: segType.doc_type,
          classification_source: segType.classification_source || 'boundary-rules',
          page_start: page.page_number,
          page_end: page.page_number,
          confidence: Math.max(...markers.map(m => m.weight), 0.5),
          boundary_markers: markers,
        };
      } else if (isBlank) {
        // Blank page — could be separator, keep in current segment but note it
        if (currentSegment) {
          currentSegment.page_end = page.page_number;
        }
      } else {
        // Continue current segment
        if (currentSegment) {
          currentSegment.page_end = page.page_number;
        }
      }
    }

    // Close last segment
    if (currentSegment) {
      segments.push(currentSegment);
    }

    // Validate no orphan pages
    this._validateCoverage(segments, pages.length);

    return segments;
  }

  /**
   * Infer segment type from boundary markers, with profiler classification fallback
   */
  _inferSegmentType(markers, classification) {
    const ruleToType = {
      'court-header': { type: 'piece', doc_type: 'unknown' },
      'petition-start': { type: 'piece', doc_type: 'peticao' },
      'sentence-start': { type: 'piece', doc_type: 'sentenca' },
      'acordao-start': { type: 'piece', doc_type: 'acordao' },
      'certidao-start': { type: 'piece', doc_type: 'certidao' },
      'attachment-label': { type: 'attachment', doc_type: 'attachment' },
      'despacho': { type: 'piece', doc_type: 'despacho' },
      'decisao': { type: 'piece', doc_type: 'decisao-interlocutoria' },
      'oficio': { type: 'piece', doc_type: 'oficio' },
      'blank-page': { type: 'separator', doc_type: 'separator' },
    };

    // Find highest-weight marker
    const sorted = [...markers].sort((a, b) => b.weight - a.weight);
    if (sorted.length > 0 && ruleToType[sorted[0].rule]) {
      const result = ruleToType[sorted[0].rule];
      // If boundary rules gave unknown, use profiler classification as fallback
      if (result.doc_type === 'unknown' && classification && classification.confidence >= 0.20) {
        return { type: result.type, doc_type: classification.primary_type, classification_source: 'profiler-fallback' };
      }
      return result;
    }

    // Default: no boundary markers matched — use profiler classification as fallback
    if (classification && classification.confidence >= 0.20) {
      return { type: 'piece', doc_type: classification.primary_type, classification_source: 'profiler-fallback' };
    }

    return { type: 'piece', doc_type: 'unknown' };
  }

  /**
   * Validate that all pages are covered by segments
   */
  _validateCoverage(segments, totalPages) {
    const coveredPages = new Set();
    for (const seg of segments) {
      for (let p = seg.page_start; p <= seg.page_end; p++) {
        coveredPages.add(p);
      }
    }

    const orphans = [];
    for (let p = 1; p <= totalPages; p++) {
      if (!coveredPages.has(p)) orphans.push(p);
    }

    if (orphans.length > 0) {
      console.warn(`Warning: Orphan pages detected: ${orphans.join(', ')}`);
    }

    return orphans;
  }

  /**
   * Save segmentation result to disk
   */
  saveSegments(segments, fileName) {
    fs.mkdirSync(this.outputDir, { recursive: true });
    const outPath = path.join(
      this.outputDir,
      `${path.parse(fileName).name}-segments.json`
    );
    const data = {
      file: fileName,
      segmented_at: new Date().toISOString(),
      total_segments: segments.length,
      segments,
    };
    fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
    return outPath;
  }
}

module.exports = { PageSegmenter };

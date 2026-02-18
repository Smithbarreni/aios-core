/**
 * qc-validator.js — AutoSplit Squad
 *
 * Quality control validation and mislabel detection.
 * Runs after export to catch errors before downstream consumption.
 *
 * Usage:
 *   node qc-validator.js --output-dir ./output/markdown/ --index ./output/markdown/index.json
 *
 * Dependencies: none (pure JS)
 */

const fs = require('fs');
const path = require('path');

/**
 * Essential pieces per process type.
 * Used by checkEssentialPieces to validate completeness.
 */
const ESSENTIAL_PIECES = {
  'eef': ['inicial-eef', 'cda', 'sentenca'],
  'fase-administrativa': [
    'defesa-administrativa', 'impugnacao-auto-infracao',
    'recurso-voluntario', 'parecer-seort', 'decisao-adene',
  ],
  'mandado-seguranca': ['inicial-ms', 'informacoes-ms', 'decisao-liminar', 'sentenca'],
  'embargos-execucao': [
    'impugnacao-embargos', 'replica-impugnacao', 'sentenca-embargos',
    'embargos-declaracao', 'apelacao', 'contrarrazoes',
  ],
  'recurso': ['peticao-recursal', 'contrarrazoes', 'acordao'],
  'acao-rescisoria': ['inicial', 'contestacao', 'sentenca'],
  'agravo': ['peticao-recursal', 'decisao-agravada', 'contrarrazoes'],
};

class QCValidator {
  constructor(options = {}) {
    this.reviewDir = options.reviewDir || './output/review';
    this.minContentLength = options.minContentLength || 50;
    this.mislabelRules = this._buildMislabelRules();
  }

  /**
   * Build mislabel detection rules — 18 patterns based on real Suzano case (42 pieces)
   */
  _buildMislabelRules() {
    return [
      // --- Original 5 ---
      {
        doc_type: 'sentenca',
        required_patterns: [/julg/i, /procedente|improcedente/i],
        min_matches: 1,
        description: 'Sentenca must contain "julgo" or "procedente/improcedente"',
      },
      {
        doc_type: 'peticao-inicial',
        required_patterns: [/excelent[ií]ssim/i, /requer/i],
        min_matches: 1,
        description: 'Peticao-inicial must contain "excelentissimo" or "requer"',
      },
      {
        doc_type: 'acordao',
        required_patterns: [/ac[oó]rd[aã]/i, /desembargador/i],
        min_matches: 1,
        description: 'Acordao must contain "acordam" or "desembargador"',
      },
      {
        doc_type: 'procuracao',
        required_patterns: [/poder/i, /substabelecer|outorg/i],
        min_matches: 1,
        description: 'Procuracao must contain "poder" or "substabelecer/outorga"',
      },
      {
        doc_type: 'certidao',
        required_patterns: [/certifico|certid[aã]o/i],
        min_matches: 1,
        description: 'Certidao must contain "certifico" or "certidao"',
      },
      // --- 13 new patterns from Suzano ---
      {
        doc_type: 'inicial-eef',
        required_patterns: [/execu[cç][aã]o\s+fiscal/i, /exequente|executad/i, /cda|certid[aã]o.*d[ií]vida.*ativa/i],
        min_matches: 1,
        description: 'Inicial-EEF must reference "execucao fiscal", "exequente/executado", or "CDA"',
      },
      {
        doc_type: 'cda',
        required_patterns: [/certid[aã]o.*d[ií]vida.*ativa/i, /inscri[cç][aã]o.*n/i],
        min_matches: 1,
        description: 'CDA must contain "certidao de divida ativa" or "inscricao"',
      },
      {
        doc_type: 'defesa-administrativa',
        required_patterns: [/defesa/i, /auto\s+de\s+infra[cç][aã]o|processo\s+administrativo/i],
        min_matches: 1,
        description: 'Defesa-administrativa must contain "defesa" or "auto de infracao/processo administrativo"',
      },
      {
        doc_type: 'impugnacao-auto-infracao',
        required_patterns: [/impugna/i, /auto\s+de\s+infra[cç][aã]o/i],
        min_matches: 1,
        description: 'Impugnacao-auto-infracao must contain "impugna" or "auto de infracao"',
      },
      {
        doc_type: 'recurso-voluntario',
        required_patterns: [/recurso\s+volunt[aá]rio/i, /recorrente|recorrid/i],
        min_matches: 1,
        description: 'Recurso-voluntario must contain "recurso voluntario" or "recorrente/recorrido"',
      },
      {
        doc_type: 'parecer',
        required_patterns: [/parecer/i],
        min_matches: 1,
        description: 'Parecer must contain "parecer"',
      },
      {
        doc_type: 'oficio',
        required_patterns: [/of[ií]cio/i],
        min_matches: 1,
        description: 'Oficio must contain "oficio"',
      },
      {
        doc_type: 'inicial-ms',
        required_patterns: [/mandado\s+de\s+seguran[cç]a/i, /impetrante|impetrad/i, /autoridade\s+coator/i],
        min_matches: 1,
        description: 'Inicial-MS must reference "mandado de seguranca", "impetrante/impetrado", or "autoridade coatora"',
      },
      {
        doc_type: 'decisao-liminar',
        required_patterns: [/liminar/i, /defiro|indefiro|concedo|tutela/i],
        min_matches: 1,
        description: 'Decisao-liminar must contain "liminar" or "defiro/indefiro/concedo/tutela"',
      },
      {
        doc_type: 'decisao-interlocutoria',
        required_patterns: [/decis[aã]o/i, /determino|intime-se|defiro|indefiro/i],
        min_matches: 1,
        description: 'Decisao-interlocutoria must contain "decisao" and an imperative verb',
      },
      {
        doc_type: 'embargos-declaracao',
        required_patterns: [/embargos.*declara[cç][aã]o/i, /obscuridade|contradi[cç][aã]o|omiss[aã]o/i],
        min_matches: 1,
        description: 'Embargos-declaracao must reference "embargos de declaracao" or their grounds',
      },
      {
        doc_type: 'apelacao',
        required_patterns: [/apela[cç][aã]o|apelante|apelad/i],
        min_matches: 1,
        description: 'Apelacao must contain "apelacao", "apelante", or "apelado"',
      },
      {
        doc_type: 'contrarrazoes',
        required_patterns: [/contrarraz[oõ]es/i, /contrarraz[oõ]es.*apela/i, /contrarraz[oõ]es.*recurso/i],
        min_matches: 1,
        description: 'Contrarrazoes must contain "contrarrazoes"',
      },
      {
        doc_type: 'laudo-constitutivo',
        required_patterns: [/laudo/i, /constitutivo|pericial|vistoria/i],
        min_matches: 1,
        description: 'Laudo-constitutivo must contain "laudo" or "constitutivo/pericial/vistoria"',
      },
      {
        doc_type: 'despacho',
        required_patterns: [/despacho/i, /cumpra-se|intime-se|cite-se|notifique-se/i],
        min_matches: 1,
        description: 'Despacho must contain "despacho" or a procedural command',
      },
    ];
  }

  /**
   * Check essential pieces for a given process type.
   *
   * @param {object[]} segments - Array of segment objects with doc_type
   * @param {string} processType - Key from ESSENTIAL_PIECES
   * @returns {{ complete: boolean, missing: string[], coverage: number }}
   */
  checkEssentialPieces(segments, processType) {
    const found = segments.map(s => s.doc_type || (s.meta && s.meta.doc_type));
    const expected = ESSENTIAL_PIECES[processType] || [];
    if (expected.length === 0) {
      return { complete: true, missing: [], coverage: 1 };
    }
    const missing = expected.filter(e => !found.includes(e));
    return {
      complete: missing.length === 0,
      missing,
      coverage: (expected.length - missing.length) / expected.length,
    };
  }

  /**
   * Parse YAML frontmatter from markdown file
   */
  parseFrontmatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return null;

    const meta = {};
    const lines = match[1].split('\n');
    for (const line of lines) {
      const kv = line.match(/^(\w[\w_-]*)\s*:\s*"?([^"]*)"?\s*$/);
      if (kv) {
        meta[kv[1]] = kv[2];
      }
    }
    return meta;
  }

  /**
   * Extract body text (after frontmatter and title)
   */
  extractBody(content) {
    const withoutFrontmatter = content.replace(/^---\n[\s\S]*?\n---\n*/, '');
    const withoutTitle = withoutFrontmatter.replace(/^#\s+.*\n*/, '');
    return withoutTitle.replace(/<!--[\s\S]*?-->/g, '').trim();
  }

  /**
   * Check if filename keywords contradict the document classification
   */
  checkFilenameMislabel(sourceFilename, docType) {
    const filenameKeywords = {
      'inicial-eef': 'inicial-eef',
      'inicial eef': 'inicial-eef',
      'inicial_eef': 'inicial-eef',
      'inicial ef': 'inicial-eef',
      'cda': 'cda',
      'defesa-administrativa': 'defesa-administrativa',
      'defesa administrativa': 'defesa-administrativa',
      'impugnacao-auto': 'impugnacao-auto-infracao',
      'impugnacao auto': 'impugnacao-auto-infracao',
      'recurso-voluntario': 'recurso-voluntario',
      'recurso voluntario': 'recurso-voluntario',
      'parecer-seort': 'parecer-seort',
      'parecer seort': 'parecer-seort',
      'decisao-adene': 'decisao-adene',
      'decisao adene': 'decisao-adene',
      'inicial-ms': 'inicial-ms',
      'inicial ms': 'inicial-ms',
      'informacoes-ms': 'informacoes-ms',
      'informacoes ms': 'informacoes-ms',
      'decisao-liminar': 'decisao-liminar',
      'decisao liminar': 'decisao-liminar',
      'decisao-interlocutoria': 'decisao-interlocutoria',
      'impugnacao-embargos': 'impugnacao-embargos',
      'impugnacao embargos': 'impugnacao-embargos',
      'replica-impugnacao': 'replica-impugnacao',
      'replica impugnacao': 'replica-impugnacao',
      'sentenca-embargos': 'sentenca-embargos',
      'sentenca embargos': 'sentenca-embargos',
      'embargos-declaracao': 'embargos-declaracao',
      'embargos declaracao': 'embargos-declaracao',
      'contrarrazoes': 'contrarrazoes',
      'laudo-constitutivo': 'laudo-constitutivo',
      'laudo constitutivo': 'laudo-constitutivo',
      oficio: 'oficio',
      laudo: 'laudo-constitutivo',
      memorando: 'memorando',
      sentenca: 'sentenca',
      acordao: 'acordao',
      apelacao: 'apelacao',
      peticao: 'peticao-inicial',
      procuracao: 'procuracao',
      certidao: 'certidao',
      portaria: 'portaria',
      despacho: 'despacho',
      agravo: 'agravo',
      parecer: 'parecer',
    };

    const nameLower = sourceFilename.toLowerCase().replace(/[_\-\.]/g, ' ');
    for (const [keyword, expectedType] of Object.entries(filenameKeywords)) {
      if (nameLower.includes(keyword) && docType !== expectedType && docType !== 'unknown') {
        return {
          severity: 'FLAG',
          check: 'mislabel',
          reason: 'filename_classification_mismatch',
          detail: `filename contains "${keyword}" but classified as "${docType}" (expected "${expectedType}")`,
          suggested_action: 'verify document classification manually',
          message: `Filename "${sourceFilename}" suggests "${expectedType}" but classified as "${docType}"`,
        };
      }
    }
    return null;
  }

  /**
   * Check for mislabels
   */
  checkMislabel(docType, bodyText) {
    const rule = this.mislabelRules.find(r => r.doc_type === docType);
    if (!rule) return null; // No rule for this type

    const matches = rule.required_patterns.filter(p => p.test(bodyText));
    if (matches.length >= rule.min_matches) return null; // Passes

    return {
      severity: 'REJECT',
      check: 'mislabel',
      message: rule.description,
      matched: matches.length,
      required: rule.min_matches,
    };
  }

  /**
   * Validate a single markdown file
   */
  validateFile(filePath) {
    const issues = [];
    const content = fs.readFileSync(filePath, 'utf8');
    const meta = this.parseFrontmatter(content);
    const body = this.extractBody(content);

    // Check 1: Metadata completeness
    const requiredFields = [
      'segment_id', 'source_pdf', 'page_range', 'doc_type',
      'segmentation_confidence', 'generated_at', 'pipeline_version'
    ];
    for (const field of requiredFields) {
      if (!meta || !meta[field]) {
        issues.push({
          severity: 'REJECT',
          check: 'missing-metadata',
          message: `Missing required field: ${field}`,
        });
      }
    }

    // Check 2: Empty content
    if (body.length < this.minContentLength) {
      issues.push({
        severity: 'REJECT',
        check: 'empty-content',
        message: `Content too short: ${body.length} chars (min: ${this.minContentLength})`,
      });
    }

    // Check 3: Mislabel detection
    if (meta && meta.doc_type) {
      const mislabel = this.checkMislabel(meta.doc_type, body);
      if (mislabel) {
        issues.push(mislabel);
      }
    }

    // Check 4: Filename vs classification cross-check
    if (meta && meta.doc_type && meta.source_pdf) {
      const filenameMislabel = this.checkFilenameMislabel(meta.source_pdf, meta.doc_type);
      if (filenameMislabel) {
        issues.push(filenameMislabel);
      }
    }

    // Check 5: Unknown doc_type
    if (meta && meta.doc_type === 'unknown') {
      issues.push({
        severity: 'FLAG',
        check: 'unknown-doc-type',
        reason: 'unknown_doc_type',
        detail: `doc_type=unknown`,
        suggested_action: 'verify document classification manually',
        message: 'Document type could not be determined',
      });
    }

    // Check 6: Low confidence
    if (meta && meta.extraction_confidence && parseFloat(meta.extraction_confidence) < 0.7) {
      issues.push({
        severity: 'FLAG',
        check: 'low-extraction-confidence',
        reason: 'low_extraction_confidence',
        detail: `extraction_confidence=${meta.extraction_confidence}`,
        suggested_action: 'check extracted text quality',
        message: `Extraction confidence ${meta.extraction_confidence} below threshold`,
      });
    }

    if (meta && meta.segmentation_confidence && parseFloat(meta.segmentation_confidence) < 0.6) {
      issues.push({
        severity: 'FLAG',
        check: 'low-segmentation-confidence',
        reason: 'low_segmentation_confidence',
        detail: `segmentation_confidence=${meta.segmentation_confidence}, doc_type=${meta.doc_type || 'unknown'}`,
        suggested_action: 'review segment boundaries',
        message: `Segmentation confidence ${meta.segmentation_confidence} below threshold`,
      });
    }

    return {
      file: path.basename(filePath),
      meta,
      issues,
      status: issues.some(i => i.severity === 'REJECT') ? 'rejected'
        : issues.some(i => i.severity === 'FLAG') ? 'flagged'
        : 'passed',
    };
  }

  /**
   * Validate page range coverage and overlaps from index
   */
  validatePageRanges(indexData) {
    const issues = [];
    const covered = new Set();
    const ranges = [];

    for (const file of indexData.files) {
      const [start, end] = file.pages.split('-').map(Number);
      ranges.push({ file: file.file, start, end });

      for (let p = start; p <= end; p++) {
        if (covered.has(p)) {
          issues.push({
            severity: 'REJECT',
            check: 'page-overlap',
            message: `Page ${p} covered by multiple segments (including ${file.file})`,
          });
        }
        covered.add(p);
      }
    }

    // Check for gaps
    if (indexData.total_pages) {
      for (let p = 1; p <= indexData.total_pages; p++) {
        if (!covered.has(p)) {
          issues.push({
            severity: 'FLAG',
            check: 'page-gap',
            message: `Page ${p} not covered by any segment`,
          });
        }
      }
    }

    return issues;
  }

  /**
   * Run full quality gate on output directory
   */
  runQualityGate(outputDir, indexPath) {
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    const results = [];
    let passed = 0;
    let flagged = 0;
    let rejected = 0;
    let mislabels = 0;

    // Validate each file
    for (const file of index.files) {
      const filePath = path.join(outputDir, file.file);
      if (!fs.existsSync(filePath)) {
        results.push({
          file: file.file,
          status: 'rejected',
          issues: [{ severity: 'REJECT', check: 'missing-file', message: 'File not found on disk' }],
        });
        rejected++;
        continue;
      }

      const result = this.validateFile(filePath);
      results.push(result);

      if (result.status === 'passed') passed++;
      else if (result.status === 'flagged') flagged++;
      else if (result.status === 'rejected') rejected++;

      if (result.issues.some(i => i.check === 'mislabel')) mislabels++;
    }

    // Validate page ranges
    const rangeIssues = this.validatePageRanges(index);
    if (rangeIssues.length > 0) {
      results.push({
        file: '_page-coverage',
        status: rangeIssues.some(i => i.severity === 'REJECT') ? 'rejected' : 'flagged',
        issues: rangeIssues,
      });
    }

    // Move rejected files to review queue
    const rejectedFiles = results.filter(r => r.status === 'rejected');
    if (rejectedFiles.length > 0) {
      fs.mkdirSync(this.reviewDir, { recursive: true });
      for (const rf of rejectedFiles) {
        if (rf.file === '_page-coverage') continue;
        const src = path.join(outputDir, rf.file);
        const dest = path.join(this.reviewDir, rf.file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dest);
        }
      }
    }

    return {
      summary: {
        total_files: index.files.length,
        passed,
        flagged,
        rejected,
        mislabels_caught: mislabels,
      },
      results,
      review_queue: this.reviewDir,
    };
  }
}

module.exports = { QCValidator, ESSENTIAL_PIECES };

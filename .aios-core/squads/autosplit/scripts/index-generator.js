/**
 * index-generator.js — AutoSplit Squad
 *
 * Generates INDEX.md automatically after export.
 * Contains: file table, statistics, essential pieces checklist.
 *
 * Usage:
 *   Called by autosplit-pipeline.js at end of Stage 6.
 *   Can also be run standalone:
 *     node index-generator.js --index ./output/markdown/index.json --output ./output/markdown/
 *
 * Dependencies: none (pure JS)
 */

const fs = require('fs');
const path = require('path');

const VERSION = '1.3.0';

/**
 * Essential pieces per process type.
 * Used to generate the checklist in INDEX.md.
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

/**
 * Human-readable labels for doc_type slugs.
 */
const DOC_TYPE_LABELS = {
  'inicial-eef': 'Inicial EEF',
  'cda': 'CDA',
  'defesa-administrativa': 'Defesa Administrativa',
  'impugnacao-auto-infracao': 'Impugnacao Auto de Infracao',
  'recurso-voluntario': 'Recurso Voluntario',
  'parecer-seort': 'Parecer SEORT',
  'decisao-adene': 'Decisao ADENE',
  'inicial-ms': 'Inicial MS',
  'informacoes-ms': 'Informacoes MS',
  'decisao-liminar': 'Decisao Liminar',
  'sentenca': 'Sentenca',
  'impugnacao-embargos': 'Impugnacao Embargos',
  'replica-impugnacao': 'Replica Impugnacao',
  'sentenca-embargos': 'Sentenca Embargos',
  'embargos-declaracao': 'Embargos de Declaracao',
  'apelacao': 'Apelacao',
  'contrarrazoes': 'Contrarrazoes',
  'peticao-recursal': 'Peticao Recursal',
  'acordao': 'Acordao',
  'decisao-agravada': 'Decisao Agravada',
  'inicial': 'Inicial',
  'contestacao': 'Contestacao',
  'peticao-inicial': 'Peticao Inicial',
  'despacho': 'Despacho',
  'decisao-interlocutoria': 'Decisao Interlocutoria',
  'oficio': 'Oficio',
  'memorando': 'Memorando',
  'parecer': 'Parecer',
  'laudo-constitutivo': 'Laudo Constitutivo',
  'procuracao': 'Procuracao',
  'certidao': 'Certidao',
  'unknown': 'Desconhecido',
};

/**
 * Check essential pieces coverage for a given process type.
 *
 * @param {string[]} foundTypes - Array of doc_type strings found in segments
 * @param {string} processType - Key from ESSENTIAL_PIECES
 * @returns {{ complete: boolean, missing: string[], found: string[], coverage: number }}
 */
function checkEssentialPieces(foundTypes, processType) {
  const expected = ESSENTIAL_PIECES[processType] || [];
  if (expected.length === 0) {
    return { complete: true, missing: [], found: [], coverage: 1 };
  }

  const found = expected.filter(e => foundTypes.includes(e));
  const missing = expected.filter(e => !foundTypes.includes(e));

  return {
    complete: missing.length === 0,
    missing,
    found,
    coverage: found.length / expected.length,
  };
}

/**
 * Detect process type from segments.
 * Heuristic: check which ESSENTIAL_PIECES set has the most matches.
 *
 * @param {string[]} foundTypes - Array of doc_type strings
 * @returns {string|null} - Best matching process type or null
 */
function detectProcessType(foundTypes) {
  let bestType = null;
  let bestScore = 0;

  for (const [processType, expected] of Object.entries(ESSENTIAL_PIECES)) {
    const matched = expected.filter(e => foundTypes.includes(e)).length;
    if (matched > bestScore) {
      bestScore = matched;
      bestType = processType;
    }
  }

  return bestScore > 0 ? bestType : null;
}

/**
 * Generate INDEX.md content from index.json data.
 *
 * @param {object} indexData - Parsed index.json from md-exporter
 * @param {object} options - Optional overrides
 * @param {string} options.processType - Force process type (auto-detected if omitted)
 * @param {object} options.pipelineReport - pipeline-report.json data for extra stats
 * @returns {string} - Markdown content for INDEX.md
 */
function generateIndexMd(indexData, options = {}) {
  const lines = [];
  const sourcePdf = indexData.source_pdf || 'unknown';
  const totalPages = indexData.total_pages || 0;
  const totalSegments = indexData.total_segments || indexData.files.length;
  const pipelineVersion = indexData.pipeline_version || VERSION;
  const generatedAt = indexData.generated_at || new Date().toISOString();

  // --- Header ---
  lines.push(`# ${sourcePdf}`);
  lines.push('');

  // --- File table ---
  lines.push('| # | Tipo | Classificacao | Paginas | Confianca | Arquivo |');
  lines.push('|---|------|---------------|---------|-----------|---------|');

  let totalConfidence = 0;
  let confidenceCount = 0;
  const foundTypes = [];

  for (let i = 0; i < indexData.files.length; i++) {
    const file = indexData.files[i];
    const num = String(i + 1).padStart(2, '0');
    const docType = file.doc_type || 'unknown';
    const label = DOC_TYPE_LABELS[docType] || docType;
    const pages = file.pages || '?';
    const confidence = file.confidence != null ? parseFloat(file.confidence).toFixed(2) : '?';

    if (file.confidence != null) {
      totalConfidence += parseFloat(file.confidence);
      confidenceCount++;
    }

    foundTypes.push(docType);
    lines.push(`| ${num} | ${label} | ${docType} | ${pages} | ${confidence} | ${file.file} |`);
  }

  lines.push('');

  // --- Statistics ---
  const avgConfidence = confidenceCount > 0
    ? (totalConfidence / confidenceCount).toFixed(2)
    : 'N/A';

  // Count OCR pages from pipeline report if available
  let ocrPages = 0;
  if (options.pipelineReport && options.pipelineReport.stages && options.pipelineReport.stages.extract) {
    const extractStage = options.pipelineReport.stages.extract;
    if (extractStage.ocr_pages) {
      ocrPages = extractStage.ocr_pages.length;
    }
    if (extractStage.files) {
      ocrPages = extractStage.files.reduce((sum, f) => sum + (f.ocr_pages ? f.ocr_pages.length : 0), 0);
    }
  }

  // Count flagged files from pipeline report
  let flaggedCount = 0;
  if (options.pipelineReport && options.pipelineReport.stages && options.pipelineReport.stages.qc) {
    flaggedCount = (options.pipelineReport.stages.qc.flagged || 0) +
                   (options.pipelineReport.stages.qc.rejected || 0);
  }

  lines.push('### Estatisticas');
  lines.push(`- **Total de paginas:** ${totalPages}`);
  lines.push(`- **Segmentos encontrados:** ${totalSegments}`);
  lines.push(`- **Paginas com OCR:** ${ocrPages}`);
  lines.push(`- **Confianca media:** ${avgConfidence}`);
  if (flaggedCount > 0) {
    lines.push(`- **Pecas sinalizadas para revisao:** ${flaggedCount}`);
  }
  lines.push('');

  // --- Essential Pieces Checklist ---
  const processType = options.processType || detectProcessType(foundTypes);

  if (processType && ESSENTIAL_PIECES[processType]) {
    const check = checkEssentialPieces(foundTypes, processType);
    const processLabel = DOC_TYPE_LABELS[processType] || processType;

    lines.push(`### Pecas Essenciais (${processLabel})`);
    for (const piece of ESSENTIAL_PIECES[processType]) {
      const pieceLabel = DOC_TYPE_LABELS[piece] || piece;
      if (foundTypes.includes(piece)) {
        lines.push(`- [x] ${pieceLabel}`);
      } else {
        lines.push(`- [ ] **${pieceLabel}** — NAO ENCONTRADA`);
      }
    }
    lines.push('');

    if (!check.complete) {
      lines.push(`> **Atencao:** ${check.missing.length} peca(s) essencial(is) nao encontrada(s). Cobertura: ${(check.coverage * 100).toFixed(0)}%`);
      lines.push('');
    }
  }

  // --- Footer ---
  lines.push('---');
  lines.push(`*Gerado automaticamente pelo AutoSplit v${pipelineVersion}*`);
  lines.push(`*Pipeline executado em ${generatedAt}*`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate INDEX.md file from index.json.
 *
 * @param {string} indexJsonPath - Path to index.json
 * @param {string} outputDir - Directory to write INDEX.md
 * @param {object} options - Optional overrides
 * @returns {{ indexMdPath: string, processType: string|null, essentialPieces: object|null }}
 */
function generateIndex(indexJsonPath, outputDir, options = {}) {
  const indexData = JSON.parse(fs.readFileSync(indexJsonPath, 'utf8'));

  // Try to load pipeline report for extra stats
  let pipelineReport = null;
  const reportPath = path.join(path.dirname(outputDir), 'pipeline-report.json');
  if (fs.existsSync(reportPath)) {
    try {
      pipelineReport = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    } catch { /* ignore */ }
  }

  const mergedOptions = { ...options, pipelineReport };
  const mdContent = generateIndexMd(indexData, mergedOptions);

  const indexMdPath = path.join(outputDir, 'INDEX.md');
  fs.writeFileSync(indexMdPath, mdContent, 'utf8');

  // Compute essential pieces result for return value
  const foundTypes = indexData.files.map(f => f.doc_type || 'unknown');
  const processType = options.processType || detectProcessType(foundTypes);
  let essentialPieces = null;
  if (processType) {
    essentialPieces = checkEssentialPieces(foundTypes, processType);
  }

  return {
    indexMdPath,
    processType,
    essentialPieces,
  };
}

// --- CLI entry point ---
if (require.main === module) {
  const args = process.argv.slice(2);
  let indexPath = null;
  let outputDir = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--index' && args[i + 1]) indexPath = args[++i];
    if (args[i] === '--output' && args[i + 1]) outputDir = args[++i];
  }

  if (!indexPath) {
    console.error('Usage: node index-generator.js --index <index.json> --output <dir>');
    process.exit(1);
  }

  outputDir = outputDir || path.dirname(indexPath);
  const result = generateIndex(indexPath, outputDir);
  console.log(`INDEX.md generated: ${result.indexMdPath}`);
  if (result.processType) {
    console.log(`Process type: ${result.processType}`);
    if (result.essentialPieces) {
      console.log(`Essential pieces coverage: ${(result.essentialPieces.coverage * 100).toFixed(0)}%`);
      if (result.essentialPieces.missing.length > 0) {
        console.log(`Missing: ${result.essentialPieces.missing.join(', ')}`);
      }
    }
  }
}

module.exports = {
  generateIndex,
  generateIndexMd,
  checkEssentialPieces,
  detectProcessType,
  ESSENTIAL_PIECES,
  DOC_TYPE_LABELS,
};

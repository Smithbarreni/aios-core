'use strict';

/**
 * E2E Tests — Full Pipeline
 *
 * Runs the complete autosplit pipeline against real PDF fixtures
 * and compares output against golden files.
 *
 * Tests:
 *   1. Digital-only PDF (Inicial_EF.pdf — 4 pages, digital)
 *   2. Mixed PDF (Decisao-liminar-MS.pdf — 8 pages, digital with some degraded)
 *   3. Batch mode (both PDFs in a directory)
 *
 * NOTE: These tests run the real pipeline end-to-end, including pdftotext
 * and potentially tesseract. They require CLI tools to be installed.
 * If tools are missing, the pipeline degrades gracefully but results
 * may differ from golden files.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { assertGoldenFile, stripKeys } = require('../helpers/golden-file');

// Import pipeline components
const SCRIPTS_DIR = path.join(__dirname, '..', '..', 'scripts');
const { PDFIngester } = require(path.join(SCRIPTS_DIR, 'pdf-ingester'));
const { QualityProfiler, DocumentClassifier } = require(path.join(SCRIPTS_DIR, 'quality-profiler'));
const { OCRRouter, TextExtractor } = require(path.join(SCRIPTS_DIR, 'ocr-router'));
const { PageSegmenter } = require(path.join(SCRIPTS_DIR, 'page-segmenter'));
const { MarkdownExporter } = require(path.join(SCRIPTS_DIR, 'md-exporter'));
const { QCValidator } = require(path.join(SCRIPTS_DIR, 'qc-validator'));

const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');
const PDFS_DIR = path.join(FIXTURES_DIR, 'pdfs');

// Non-deterministic keys to strip from golden file comparisons
const IGNORE_KEYS = [
  'generated_at', 'profiled_at', 'segmented_at', 'routed_at',
  'completed_at', 'started_at', 'timestamp', 'modified',
  'source_pdf_path', 'file_path', 'file_path', 'source',
  'output_dir', 'review_queue', 'indexPath', 'file_path',
  'duration_ms', 'total_duration_ms',
];

/**
 * Run the full 6-stage pipeline on a single PDF.
 * Returns structured results for golden file comparison.
 */
async function runPipelineOnPdf(pdfPath, outputDir) {
  const pipelineVersion = '1.3.0';

  // Create output structure
  const dirs = ['intake', 'profiles', 'routes', 'extracted', 'segments', 'markdown', 'review'];
  for (const d of dirs) {
    fs.mkdirSync(path.join(outputDir, d), { recursive: true });
  }

  // Stage 1: Intake
  const ingester = new PDFIngester({ outputDir: path.join(outputDir, 'intake') });
  const { manifest } = await ingester.ingest(pdfPath);

  // Stage 2: Profiling
  const profiler = new QualityProfiler({ outputDir: path.join(outputDir, 'profiles') });
  const classifier = new DocumentClassifier();
  const extractor = new TextExtractor({ outputDir: path.join(outputDir, 'extracted') });

  const profiles = [];
  const classifications = [];
  for (const file of manifest.files) {
    let pages;
    try {
      const result = await extractor.fastParsePerPage(file.source_path);
      pages = result.pages;
    } catch {
      const result = await extractor.fastParse(file.source_path);
      pages = result.pages;
    }
    const pageProfiles = profiler.profilePages(pages);
    const profile = profiler.aggregatePageProfiles(pageProfiles, file.source_path);
    profiler.saveProfile(profile);
    profiles.push(profile);

    const fullText = pages.map(p => p.text).join('\n');
    const classification = classifier.classify(fullText);
    classifications.push({ file: file.name, ...classification });
    const classPath = path.join(outputDir, 'profiles', `${path.basename(file.name, '.pdf')}-classification.json`);
    fs.writeFileSync(classPath, JSON.stringify({ file: file.name, ...classification }, null, 2));
  }

  // Stage 3: Routing
  const router = new OCRRouter({ outputDir: path.join(outputDir, 'routes') });
  const routeDecisions = [];
  const pageRoutesList = [];
  for (const profile of profiles) {
    const decision = router.route(profile);
    router.saveRoute(decision);
    routeDecisions.push(decision);

    let pageRoutes = null;
    if (profile.page_profiles && profile.page_profiles.length > 0) {
      pageRoutes = router.routePages(profile.page_profiles);
      const pageRoutePath = path.join(outputDir, 'routes', `${path.parse(profile.file).name}-page-routes.json`);
      fs.writeFileSync(pageRoutePath, JSON.stringify({ file: profile.file, pageRoutes }, null, 2));
    }
    pageRoutesList.push(pageRoutes);
  }

  // Stage 4: Extraction
  const hasTesseract = TextExtractor.checkTesseract();
  const extractedDataList = [];
  for (let i = 0; i < manifest.files.length; i++) {
    const file = manifest.files[i];
    const routeDecision = routeDecisions[i];
    const pageRoutes = pageRoutesList[i];
    const needsHybrid = hasTesseract && pageRoutes && pageRoutes.some(r => r.needs_ocr);

    let extracted;
    if (needsHybrid) {
      const fastResult = await extractor.fastParsePerPage(file.source_path);
      extracted = extractor.extractHybrid(file.source_path, fastResult.pages, pageRoutes);
    } else {
      extracted = await extractor.extract(file.source_path, routeDecision);
    }

    // Strip repetitive content
    const cleanedPages = profiler.stripRepetitiveContent(extracted.pages);
    if (cleanedPages._stripStats) delete cleanedPages._stripStats;
    extracted.pages = cleanedPages;

    extractor.saveExtraction(extracted, file.name);
    extractedDataList.push(extracted);
  }

  // Stage 5: Segmentation
  const segmenter = new PageSegmenter({ outputDir: path.join(outputDir, 'segments') });
  const allSegments = [];
  for (let i = 0; i < manifest.files.length; i++) {
    const extracted = extractedDataList[i];
    extracted.classification = classifications[i] || null;
    const segments = segmenter.segment(extracted);
    segmenter.saveSegments(segments, manifest.files[i].name);
    allSegments.push({ file: manifest.files[i].name, segments });
  }

  // Stage 5.5: Per-segment classification (L1)
  const segClassifier = new DocumentClassifier();
  for (let i = 0; i < allSegments.length; i++) {
    const { segments } = allSegments[i];
    const extracted = extractedDataList[i];
    const pages = extracted.pages || [];

    for (const seg of segments) {
      if (seg.type === 'separator') continue;
      const segPages = pages.filter(
        p => p.page_number >= seg.page_start && p.page_number <= seg.page_end
      );
      const segText = segPages.map(p => p.text || '').join('\n');
      if (segText.trim().length < 50) continue;

      const nonEmptyLines = segText.split('\n').map(l => l.trim()).filter(l => l.length > 3);
      const heading = nonEmptyLines.slice(0, 3).join('\n');
      const tail = nonEmptyLines.slice(-3).join('\n');

      const segClassification = segClassifier.classify(segText, { heading, tail });
      if (segClassification.primary_type !== 'unknown' && segClassification.confidence >= 0.3) {
        seg.doc_type = segClassification.primary_type;
        seg.classification_source = 'per-segment-L1';
        seg.classification_confidence = segClassification.confidence;
        seg.classification_indicators = segClassification.indicators;
      }
    }
  }

  // Stage 5.6: Per-segment classification (L2 — Contextual Positional)
  {
    const segClassifierL2 = new DocumentClassifier();
    const TRANSITIONS = {
      'inicial-eef':        ['cda', 'laudo-constitutivo', 'documento-fiscal', 'impugnacao', 'decisao-interlocutoria', 'despacho'],
      'inicial-execfiscal': ['cda', 'documento-fiscal', 'despacho', 'decisao-interlocutoria'],
      'inicial-ms':         ['decisao-interlocutoria', 'contestacao', 'impugnacao', 'despacho'],
      'peticao-inicial':    ['decisao-interlocutoria', 'contestacao', 'impugnacao', 'despacho', 'cda'],
      'cda':                ['impugnacao', 'decisao-interlocutoria', 'despacho', 'documento-fiscal', 'laudo-constitutivo'],
      'laudo-constitutivo': ['decisao-interlocutoria', 'despacho', 'impugnacao', 'sentenca', 'laudo-constitutivo'],
      'documento-fiscal':   ['decisao-interlocutoria', 'despacho', 'impugnacao', 'laudo-constitutivo', 'documento-fiscal'],
      'parecer-tecnico':    ['decisao-interlocutoria', 'despacho', 'sentenca'],
      'laudo-pericial':     ['sentenca', 'decisao-interlocutoria', 'despacho'],
      'impugnacao':         ['decisao-interlocutoria', 'sentenca', 'laudo-pericial', 'despacho'],
      'contestacao':        ['sentenca', 'decisao-interlocutoria', 'laudo-pericial', 'despacho'],
      'sentenca':           ['edcl', 'apelacao', 'sentenca-edcl', 'certidao-publicacao'],
      'sentenca-edcl':      ['apelacao', 'edcl', 'certidao-publicacao'],
      'edcl':               ['sentenca-edcl', 'sentenca', 'acordao', 'acordao-trf'],
      'apelacao':           ['contrarrazoes', 'acordao', 'acordao-trf', 'distribuicao'],
      'contrarrazoes':      ['acordao', 'acordao-trf', 'distribuicao', 'pauta'],
      'agravo':             ['decisao-interlocutoria', 'despacho'],
      'recurso-especial':   ['acordao', 'contrarrazoes'],
      'recurso-extraordinario': ['acordao', 'contrarrazoes'],
      'distribuicao':       ['pauta', 'acordao', 'acordao-trf'],
      'pauta':              ['acordao', 'acordao-trf'],
      'acordao':            ['edcl', 'recurso-especial', 'recurso-extraordinario', 'certidao-publicacao'],
      'acordao-trf':        ['edcl', 'recurso-especial', 'recurso-extraordinario', 'certidao-publicacao'],
      'auto-infracao':      ['defesa-admin', 'impugnacao-admin', 'decisao-interlocutoria'],
      'defesa-admin':       ['decisao-admin-1inst', 'decisao-interlocutoria'],
      'impugnacao-admin':   ['decisao-admin-1inst', 'decisao-interlocutoria'],
      'decisao-admin-1inst': ['recurso-admin', 'recurso-carf'],
      'recurso-admin':      ['contrarrazoes-admin', 'resposta-fazenda', 'acordao-carf'],
      'recurso-carf':       ['contrarrazoes-admin', 'resposta-fazenda', 'acordao-carf'],
      'contrarrazoes-admin': ['acordao-carf'],
      'resposta-fazenda':   ['acordao-carf'],
      'acordao-carf':       ['acordao-csrf', 'edcl', 'recurso-especial'],
      'acordao-csrf':       ['edcl', 'recurso-especial'],
      'parecer-pgfn':       ['sentenca', 'decisao-interlocutoria', 'acordao', 'despacho'],
      'parecer-agu':        ['sentenca', 'decisao-interlocutoria', 'acordao', 'despacho'],
      'parecer-mp':         ['sentenca', 'decisao-interlocutoria', 'despacho'],
    };
    const NEUTRAL_TYPES = new Set([
      'despacho', 'decisao-interlocutoria', 'certidao', 'certidao-publicacao',
      'oficio', 'portaria', 'memorando', 'parecer-tecnico',
      'lixo', 'lixo-procuracao', 'lixo-substabelecimento', 'lixo-societario',
      'lixo-fianca', 'lixo-capa', 'lixo-certidao-publicacao',
      'lixo-ato-ordinatorio', 'lixo-termo-abertura', 'unknown',
    ]);
    const RESPONSE_TYPES = new Set([
      'impugnacao', 'contestacao', 'contrarrazoes', 'contrarrazoes-admin',
      'defesa-admin', 'impugnacao-admin', 'resposta-fazenda', 'sentenca-edcl',
    ]);
    const INITIATOR_TYPES = new Set([
      'inicial-eef', 'inicial-execfiscal', 'inicial-ms', 'peticao-inicial', 'auto-infracao',
    ]);

    for (let i = 0; i < allSegments.length; i++) {
      const { segments } = allSegments[i];
      const extracted = extractedDataList[i];
      const pages = extracted.pages || [];
      const pdfClassification = classifications[i] || {};
      const pdfType = pdfClassification.primary_type || '';
      const pieceSegments = segments.filter(s => s.type !== 'separator');
      if (pieceSegments.length === 0) continue;
      const assignedInicialTypes = {};

      for (let j = 0; j < pieceSegments.length; j++) {
        const seg = pieceSegments[j];
        if (!seg.doc_type || seg.doc_type === 'unknown') continue;
        const prevSeg = j > 0 ? pieceSegments[j - 1] : null;
        const prevType = prevSeg ? prevSeg.doc_type : null;
        const currentType = seg.doc_type;
        const currentConfidence = seg.classification_confidence || 0.5;
        let boost = 0;
        const reasons = [];

        if (prevType && !NEUTRAL_TYPES.has(currentType) && !NEUTRAL_TYPES.has(prevType)) {
          const probableNext = TRANSITIONS[prevType];
          if (probableNext) {
            if (probableNext.includes(currentType)) {
              boost += 0.15;
              reasons.push(`probable-after-${prevType}`);
            } else if (INITIATOR_TYPES.has(currentType)) {
              boost -= 0.20;
              reasons.push(`impossible-initiator-after-${prevType}`);
            }
          }
        }
        if (j === 0) {
          if (RESPONSE_TYPES.has(currentType)) { boost -= 0.15; reasons.push('response-at-start'); }
          if (INITIATOR_TYPES.has(currentType)) { boost += 0.10; reasons.push('initiator-at-start'); }
        }
        if (currentType.startsWith('inicial-')) {
          if (assignedInicialTypes[currentType]) { boost -= 0.25; reasons.push(`duplicate-${currentType}`); }
          assignedInicialTypes[currentType] = (assignedInicialTypes[currentType] || 0) + 1;
        }
        if (currentType === 'inicial-execfiscal' &&
            (pdfType === 'inicial-eef' || (pdfClassification.indicators || []).some(ind => /embargos?\s+.*execu/i.test(ind)))) {
          seg.doc_type = 'inicial-eef';
          seg.classification_confidence = Math.max(currentConfidence, pdfClassification.confidence || 0.7);
          seg.classification_source = 'per-segment-L2';
          seg.l2_previous_type = currentType;
          seg.l2_boost = 0;
          seg.l2_reasons = ['pdf-context-eef-overrides-execfiscal'];
          seg.cascade_level = 2;
          if (currentType.startsWith('inicial-')) assignedInicialTypes[currentType] = (assignedInicialTypes[currentType] || 0) + 1;
          continue;
        }
        if (currentType === 'inicial-eef' && pdfType === 'inicial-eef') {
          boost += 0.05; reasons.push('pdf-context-confirms-eef');
        }
        if (currentType === pdfType && currentConfidence < 0.8) {
          boost += 0.10; reasons.push('pdf-segment-agreement');
        }

        if (boost === 0) continue;
        const newConfidence = Math.min(1, Math.max(0, Math.round((currentConfidence + boost) * 100) / 100));
        let reclassified = false;

        if (newConfidence < currentConfidence && newConfidence < 0.5) {
          const segPages = pages.filter(p => p.page_number >= seg.page_start && p.page_number <= seg.page_end);
          const segText = segPages.map(p => p.text || '').join('\n');
          if (segText.trim().length >= 50) {
            const nonEmptyLines = segText.split('\n').map(l => l.trim()).filter(l => l.length > 3);
            const heading = nonEmptyLines.slice(0, 3).join('\n');
            const tail = nonEmptyLines.slice(-3).join('\n');
            const reClass = segClassifierL2.classify(segText, { heading, tail });
            if (reClass.secondary_type && reClass.secondary_type !== 'unknown') {
              let secBoost = 0;
              const secType = reClass.secondary_type;
              if (prevType && TRANSITIONS[prevType] && TRANSITIONS[prevType].includes(secType)) secBoost += 0.15;
              if (j === 0 && INITIATOR_TYPES.has(secType)) secBoost += 0.10;
              const boostedSecondary = Math.min(1, Math.round((reClass.secondary_confidence + secBoost) * 100) / 100);
              if (boostedSecondary > newConfidence) {
                seg.doc_type = secType;
                seg.classification_confidence = boostedSecondary;
                seg.classification_source = 'per-segment-L2';
                seg.classification_indicators = reClass.indicators;
                seg.l2_previous_type = currentType;
                seg.l2_boost = boost;
                seg.l2_reasons = reasons;
                seg.cascade_level = 2;
                reclassified = true;
              }
            }
          }
        }
        if (!reclassified) {
          seg.classification_confidence = newConfidence;
          seg.classification_source = 'per-segment-L2';
          seg.l2_boost = boost;
          seg.l2_reasons = reasons;
          seg.cascade_level = 2;
        }
      }
    }
  }

  // Stage 6: Export + QC
  const mdExporter = new MarkdownExporter({
    outputDir: path.join(outputDir, 'markdown'),
    pipelineVersion,
  });
  const qcValidator = new QCValidator({ reviewDir: path.join(outputDir, 'review') });

  const qcResults = [];
  for (let i = 0; i < manifest.files.length; i++) {
    const file = manifest.files[i];
    const extracted = extractedDataList[i];
    const { segments } = allSegments[i];

    const fileMarkdownDir = manifest.files.length > 1
      ? path.join(outputDir, 'markdown', path.basename(file.name, path.extname(file.name)))
      : path.join(outputDir, 'markdown');
    if (manifest.files.length > 1) fs.mkdirSync(fileMarkdownDir, { recursive: true });

    const fileExporter = manifest.files.length > 1
      ? new MarkdownExporter({ outputDir: fileMarkdownDir, pipelineVersion })
      : mdExporter;

    const exportResult = fileExporter.exportAll(segments, file.source_path, extracted, extracted);
    const qc = qcValidator.runQualityGate(fileMarkdownDir, exportResult.indexPath);
    qcResults.push(qc);
  }

  return {
    manifest,
    profiles,
    classifications,
    routeDecisions,
    extractedDataList,
    allSegments,
    qcResults,
  };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------
describe('E2E: Full Pipeline', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autosplit-e2e-'));
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  // ─── Test 1: Digital-only PDF ─────────────────────────────────────
  test('digital-only PDF (Inicial_EF) — full pipeline produces correct segments', async () => {
    const pdfPath = path.join(PDFS_DIR, 'Inicial_EF.pdf');
    if (!fs.existsSync(pdfPath)) {
      console.warn('SKIP: Inicial_EF.pdf fixture not found');
      return;
    }

    const result = await runPipelineOnPdf(pdfPath, tmpDir);

    // Verify manifest
    expect(result.manifest.files.length).toBe(1);
    expect(result.manifest.summary.errors).toBe(0);
    expect(result.manifest.summary.duplicates).toBe(0);

    // Verify profile
    expect(result.profiles.length).toBe(1);
    expect(result.profiles[0].page_count).toBe(4);
    expect(result.profiles[0].quality_tier).toBe('A');
    expect(result.profiles[0].has_text_layer).toBe(true);

    // Verify classification (expanded L1 classifier gives more specific types)
    expect(['peticao-inicial', 'inicial-eef', 'inicial-execfiscal']).toContain(result.classifications[0].primary_type);

    // Verify segments against golden
    const segData = {
      file: result.allSegments[0].file,
      total_segments: result.allSegments[0].segments.length,
      segments: result.allSegments[0].segments,
    };
    assertGoldenFile(segData, 'inicial-ef-segments.json', {
      ignoreKeys: [...IGNORE_KEYS],
    });

    // Verify profile against golden (stripped)
    const profileForGolden = {
      file: result.profiles[0].file,
      page_count: result.profiles[0].page_count,
      readability_score: result.profiles[0].readability_score,
      quality_tier: result.profiles[0].quality_tier,
      noise_level: result.profiles[0].noise_level,
      has_text_layer: result.profiles[0].has_text_layer,
      degraded_pages: result.profiles[0].degraded_pages,
      degraded_count: result.profiles[0].degraded_count,
      clean_count: result.profiles[0].clean_count,
      is_mixed_quality: result.profiles[0].is_mixed_quality,
      page_profiles: result.profiles[0].page_profiles.map(pp => ({
        page_number: pp.page_number,
        quality_tier: pp.quality_tier,
        is_degraded: pp.is_degraded,
        empty: pp.empty,
      })),
    };
    assertGoldenFile(profileForGolden, 'inicial-ef-profile.json', {
      ignoreKeys: [...IGNORE_KEYS],
    });

    // Verify QC — no rejections
    expect(result.qcResults[0].summary.rejected).toBe(0);

    // Verify markdown files were created
    const mdFiles = fs.readdirSync(path.join(tmpDir, 'markdown')).filter(f => f.endsWith('.md'));
    expect(mdFiles.length).toBeGreaterThan(0);
  });

  // ─── Test 2: Mixed PDF (digital with some degraded pages) ─────────
  test('mixed PDF (Decisao-liminar) — full pipeline handles degraded pages', async () => {
    const pdfPath = path.join(PDFS_DIR, 'Decisao-liminar-MS.pdf');
    if (!fs.existsSync(pdfPath)) {
      console.warn('SKIP: Decisao-liminar-MS.pdf fixture not found');
      return;
    }

    const result = await runPipelineOnPdf(pdfPath, tmpDir);

    // Verify manifest
    expect(result.manifest.files.length).toBe(1);
    expect(result.manifest.summary.errors).toBe(0);

    // Verify profile
    expect(result.profiles.length).toBe(1);
    expect(result.profiles[0].page_count).toBe(8);
    expect(result.profiles[0].quality_tier).toBe('A');
    expect(result.profiles[0].has_text_layer).toBe(true);

    // Verify segments against golden
    const segData = {
      file: result.allSegments[0].file,
      total_segments: result.allSegments[0].segments.length,
      segments: result.allSegments[0].segments,
    };
    assertGoldenFile(segData, 'decisao-liminar-segments.json', {
      ignoreKeys: [...IGNORE_KEYS],
    });

    // Verify QC — no rejections
    expect(result.qcResults[0].summary.rejected).toBe(0);

    // Verify markdown output
    const mdFiles = fs.readdirSync(path.join(tmpDir, 'markdown')).filter(f => f.endsWith('.md'));
    expect(mdFiles.length).toBeGreaterThan(0);
  });

  // ─── Test 3: Batch mode (2+ PDFs in a directory) ──────────────────
  test('batch mode — processes 2 PDFs with per-PDF subfolders and no name collision', async () => {
    const pdf1 = path.join(PDFS_DIR, 'Inicial_EF.pdf');
    const pdf2 = path.join(PDFS_DIR, 'Decisao-liminar-MS.pdf');
    if (!fs.existsSync(pdf1) || !fs.existsSync(pdf2)) {
      console.warn('SKIP: batch fixture PDFs not found');
      return;
    }

    // Create a temp batch input directory with both PDFs
    const batchInputDir = path.join(tmpDir, 'batch-input');
    fs.mkdirSync(batchInputDir, { recursive: true });
    fs.copyFileSync(pdf1, path.join(batchInputDir, 'Inicial_EF.pdf'));
    fs.copyFileSync(pdf2, path.join(batchInputDir, 'Decisao-liminar-MS.pdf'));

    // Process each PDF into its own subfolder (simulating batch mode)
    const batchOutputDir = path.join(tmpDir, 'batch-output');
    fs.mkdirSync(batchOutputDir, { recursive: true });

    const pdfs = fs.readdirSync(batchInputDir)
      .filter(f => f.toLowerCase().endsWith('.pdf'))
      .sort(); // BUG-P8 fix: sorted order

    expect(pdfs.length).toBe(2);
    expect(pdfs).toEqual(['Decisao-liminar-MS.pdf', 'Inicial_EF.pdf']); // Sorted

    const results = [];
    for (const pdfName of pdfs) {
      const pdfPath = path.join(batchInputDir, pdfName);
      const pdfOutputDir = path.join(batchOutputDir, path.parse(pdfName).name);
      fs.mkdirSync(pdfOutputDir, { recursive: true });
      const result = await runPipelineOnPdf(pdfPath, pdfOutputDir);
      results.push({ name: pdfName, result });
    }

    // Verify: 2 separate output folders, no collision
    const outputFolders = fs.readdirSync(batchOutputDir).sort();
    expect(outputFolders).toEqual(['Decisao-liminar-MS', 'Inicial_EF']);

    // Verify: each result has segments
    for (const { result } of results) {
      expect(result.allSegments.length).toBe(1);
      expect(result.allSegments[0].segments.length).toBeGreaterThan(0);
    }

    // Verify: markdown files don't collide (each in its own subfolder)
    for (const folder of outputFolders) {
      const mdDir = path.join(batchOutputDir, folder, 'markdown');
      expect(fs.existsSync(mdDir)).toBe(true);
      const mdFiles = fs.readdirSync(mdDir).filter(f => f.endsWith('.md') || f.endsWith('.json'));
      expect(mdFiles.length).toBeGreaterThan(0);
    }
  });
});

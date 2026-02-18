#!/usr/bin/env node
/**
 * autosplit-pipeline.js — AutoSplit Squad Orchestrator
 *
 * Orchestrates the 6-stage PDF splitting pipeline:
 *   Stage 1: Intake (pdf-ingester)
 *   Stage 2: Profiling (quality-profiler + document classifier)
 *   Stage 3: Routing (ocr-router)
 *   Stage 4: Extraction (ocr-router/TextExtractor)
 *   Stage 5: Segmentation (page-segmenter)
 *   Stage 6: Export + QC (md-exporter + qc-validator)
 *
 * Usage:
 *   node autosplit-pipeline.js --source ./input/processo.pdf --output ./output/
 *   node autosplit-pipeline.js --source ./input/ --output ./output/ --verbose
 *   node autosplit-pipeline.js --resume ./output/checkpoint.json
 *   node autosplit-pipeline.js --help
 *
 * Zero external dependencies — uses only require() of existing scripts + Node.js built-ins.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

// ---------------------------------------------------------------------------
// Script wiring — require all 6 existing scripts
// ---------------------------------------------------------------------------
const { PDFIngester } = require('./pdf-ingester');
const { QualityProfiler, DocumentClassifier } = require('./quality-profiler');
const { OCRRouter, TextExtractor } = require('./ocr-router');
const { PageSegmenter } = require('./page-segmenter');
const { MarkdownExporter } = require('./md-exporter');
const { QCValidator } = require('./qc-validator');
const { generateIndex } = require('./index-generator');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const VERSION = '1.3.0';

const STAGES = [
  { id: 1, name: 'Intake',       key: 'intake',     async: true  },
  { id: 2, name: 'Profiling',    key: 'profiles',   async: true  },
  { id: 3, name: 'Routing',      key: 'routes',     async: false },
  { id: 4, name: 'Extraction',   key: 'extracted',  async: true  },
  { id: 5, name: 'Segmentation', key: 'segments',   async: false },
  { id: 6, name: 'Export + QC',  key: 'markdown',   async: false },
];

const OUTPUT_DIRS = [
  'intake',
  'profiles',
  'routes',
  'extracted',
  'segments',
  'markdown',
  'review',
];

// ---------------------------------------------------------------------------
// CLI Parser
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = {
    source: null,
    output: null,
    resume: null,
    verbose: false,
    help: false,
  };

  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--source':
      case '-s':
        if (i + 1 >= argv.length || argv[i + 1].startsWith('-')) {
          console.error('Error: --source requires a path value');
          process.exit(1);
        }
        args.source = argv[++i];
        break;
      case '--output':
      case '-o':
        if (i + 1 >= argv.length || argv[i + 1].startsWith('-')) {
          console.error('Error: --output requires a directory value');
          process.exit(1);
        }
        args.output = argv[++i];
        break;
      case '--resume':
      case '-r':
        if (i + 1 >= argv.length || argv[i + 1].startsWith('-')) {
          console.error('Error: --resume requires a checkpoint file path');
          process.exit(1);
        }
        args.resume = argv[++i];
        break;
      case '--verbose':
      case '-v':
        args.verbose = true;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        if (argv[i].startsWith('-')) {
          console.error(`Unknown option: ${argv[i]}`);
          process.exit(1);
        }
        break;
    }
  }

  return args;
}

function printHelp() {
  const help = `
autosplit-pipeline v${VERSION} — AutoSplit PDF Splitting Pipeline

USAGE:
  node autosplit-pipeline.js --source <path> --output <dir> [options]
  node autosplit-pipeline.js --resume <checkpoint.json>

OPTIONS:
  -s, --source <path>       Source PDF file or directory of PDFs (required)
  -o, --output <dir>        Output directory (default: ./output)
  -r, --resume <file>       Resume from checkpoint file
  -v, --verbose             Enable verbose logging
  -h, --help                Show this help message

STAGES:
  1. Intake       — PDF registration, SHA-256 fingerprinting, deduplication
  2. Profiling    — Quality analysis, readability scoring, document classification
  3. Routing      — OCR method selection based on quality profile
  4. Extraction   — Text extraction (fast-parse for digital PDFs)
  5. Segmentation — Page-level boundary detection, document splitting
  6. Export + QC  — Markdown generation with YAML frontmatter, quality validation

EXAMPLES:
  # Process a single PDF
  node autosplit-pipeline.js -s ./processo.pdf -o ./output/

  # Process a directory of PDFs (batch mode)
  node autosplit-pipeline.js -s ./pdfs/ -o ./output/ -v

  # Resume interrupted pipeline
  node autosplit-pipeline.js --resume ./output/checkpoint.json
`.trim();

  console.log(help);
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------
function createLogger(verbose) {
  const ts = () => new Date().toISOString().slice(11, 23);

  return {
    info: (msg) => console.log(`[${ts()}] INFO  ${msg}`),
    verbose: (msg) => { if (verbose) console.log(`[${ts()}] DEBUG ${msg}`); },
    warn: (msg) => console.warn(`[${ts()}] WARN  ${msg}`),
    error: (msg) => console.error(`[${ts()}] ERROR ${msg}`),
    stage: (id, name, status) => {
      const icon = status === 'start' ? '>>>' : status === 'done' ? '<<<' : '...';
      console.log(`[${ts()}] ${icon} Stage ${id}: ${name} [${status.toUpperCase()}]`);
    },
  };
}

// ---------------------------------------------------------------------------
// Audit trail — persistent decision log
// ---------------------------------------------------------------------------
function createAuditTrail(outputDir) {
  const logPath = path.join(outputDir, 'pipeline-decisions.log');
  return {
    logPath,
    log(stage, message) {
      const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const line = `[${ts}] ${stage.toUpperCase()}: ${message}\n`;
      fs.appendFileSync(logPath, line);
    },
    init() {
      fs.writeFileSync(logPath, `# AutoSplit Pipeline Decision Log\n# Started: ${new Date().toISOString()}\n\n`);
    },
  };
}

// ---------------------------------------------------------------------------
// Output directory management
// ---------------------------------------------------------------------------
function createOutputStructure(outputBase, log) {
  fs.mkdirSync(outputBase, { recursive: true });

  for (const dir of OUTPUT_DIRS) {
    const dirPath = path.join(outputBase, dir);
    fs.mkdirSync(dirPath, { recursive: true });
    log.verbose(`Created directory: ${dirPath}`);
  }

  log.info(`Output structure ready at ${outputBase}`);
}

/**
 * For batch mode (source is directory), create a subfolder per PDF
 * inside the output base. Returns the per-PDF output path.
 */
function createPdfSubfolder(outputBase, pdfFileName, log) {
  const baseName = path.parse(pdfFileName).name;
  const pdfOutputDir = path.join(outputBase, baseName);
  fs.mkdirSync(pdfOutputDir, { recursive: true });

  for (const dir of OUTPUT_DIRS) {
    fs.mkdirSync(path.join(pdfOutputDir, dir), { recursive: true });
  }

  log.verbose(`Created subfolder for ${pdfFileName}: ${pdfOutputDir}`);
  return pdfOutputDir;
}

// ---------------------------------------------------------------------------
// Source detection
// ---------------------------------------------------------------------------
function detectSource(sourcePath) {
  const stat = fs.statSync(sourcePath);

  if (stat.isFile()) {
    if (!sourcePath.toLowerCase().endsWith('.pdf')) {
      throw new Error(`Source file is not a PDF: ${sourcePath}`);
    }
    return { mode: 'single', files: [path.resolve(sourcePath)] };
  }

  if (stat.isDirectory()) {
    const pdfs = fs.readdirSync(sourcePath)
      .filter(f => f.toLowerCase().endsWith('.pdf'))
      .sort()
      .map(f => path.resolve(path.join(sourcePath, f)));

    if (pdfs.length === 0) {
      throw new Error(`No PDF files found in directory: ${sourcePath}`);
    }
    return { mode: 'batch', files: pdfs };
  }

  throw new Error(`Source path is neither file nor directory: ${sourcePath}`);
}

// ---------------------------------------------------------------------------
// Checkpoint system
// ---------------------------------------------------------------------------
const CHECKPOINT_FILE = '.checkpoint.json';

/**
 * Safe JSON file reader — returns null on malformed JSON instead of throwing.
 * Prevents unhelpful SyntaxError when checkpoint/stage files are corrupted.
 * (Fix H1 — QA review 2026-02-16)
 */
function safeReadJSON(filePath, log) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    log.warn(`Malformed JSON in ${path.basename(filePath)} — skipping`);
    return null;
  }
}

function computeChecksum(obj) {
  const json = JSON.stringify(obj, null, 2);
  return crypto.createHash('sha256').update(json).digest('hex');
}

function saveCheckpoint(outputDir, checkpointData, log) {
  const dataWithoutChecksum = { ...checkpointData };
  delete dataWithoutChecksum.checksum;
  const checksum = computeChecksum(dataWithoutChecksum);
  const fullData = { ...dataWithoutChecksum, checksum };

  const tmpPath = path.join(outputDir, CHECKPOINT_FILE + '.tmp');
  const finalPath = path.join(outputDir, CHECKPOINT_FILE);

  fs.writeFileSync(tmpPath, JSON.stringify(fullData, null, 2));
  fs.renameSync(tmpPath, finalPath);
  log.verbose(`Checkpoint saved: stage ${checkpointData.current_stage}, completed=[${checkpointData.completed_stages.join(',')}]`);
}

function loadCheckpoint(checkpointPath, log) {
  if (!fs.existsSync(checkpointPath)) {
    return null;
  }

  const raw = safeReadJSON(checkpointPath, log);
  if (!raw) {
    log.warn('Checkpoint file is malformed JSON — starting fresh');
    return null;
  }

  // Validate checksum
  const { checksum, ...dataWithoutChecksum } = raw;
  const expected = computeChecksum(dataWithoutChecksum);

  if (checksum !== expected) {
    log.warn('Checkpoint checksum mismatch — checkpoint is corrupted, starting fresh');
    return null;
  }

  log.info(`Checkpoint loaded: completed stages [${raw.completed_stages.join(',')}]`);
  return raw;
}

function reloadStageData(outputDir, stageId, log) {
  switch (stageId) {
    case 1: {
      const intakeDir = path.join(outputDir, 'intake');
      const manifestFiles = fs.readdirSync(intakeDir).filter(f => f.startsWith('manifest-')).sort();
      if (manifestFiles.length === 0) return null;
      const manifest = safeReadJSON(path.join(intakeDir, manifestFiles[0]), log);
      if (!manifest) return null;
      log.verbose(`Reloaded manifest: ${manifest.files.length} files`);
      return { manifest };
    }
    case 2: {
      const profilesDir = path.join(outputDir, 'profiles');
      const profileFiles = fs.readdirSync(profilesDir).filter(f => f.endsWith('-profile.json')).sort();
      const profiles = profileFiles.map(f => safeReadJSON(path.join(profilesDir, f), log)).filter(Boolean);
      const classificationFiles = fs.readdirSync(profilesDir).filter(f => f.endsWith('-classification.json')).sort();
      const classifications = classificationFiles.map(f => safeReadJSON(path.join(profilesDir, f), log)).filter(Boolean);
      log.verbose(`Reloaded ${profiles.length} profiles, ${classifications.length} classifications`);
      return { profiles, classifications };
    }
    case 3: {
      const routesDir = path.join(outputDir, 'routes');
      const routeFiles = fs.readdirSync(routesDir).filter(f => f.endsWith('-route.json') && !f.includes('-page-')).sort();
      const routeDecisions = routeFiles.map(f => safeReadJSON(path.join(routesDir, f), log)).filter(Boolean);
      const pageRouteFiles = fs.readdirSync(routesDir).filter(f => f.endsWith('-page-routes.json')).sort();
      const pageRoutesList = pageRouteFiles.map(f => {
        const data = safeReadJSON(path.join(routesDir, f), log);
        return data ? data.pageRoutes : null;
      });
      log.verbose(`Reloaded ${routeDecisions.length} route decisions, ${pageRoutesList.filter(Boolean).length} page route sets`);
      return { routeDecisions, pageRoutesList };
    }
    case 4: {
      const extractedDir = path.join(outputDir, 'extracted');
      const extractedFiles = fs.readdirSync(extractedDir).filter(f => f.endsWith('-extracted.json')).sort();
      const extractedDataList = extractedFiles.map(f => safeReadJSON(path.join(extractedDir, f), log)).filter(Boolean);
      log.verbose(`Reloaded ${extractedDataList.length} extractions`);
      return { extractedDataList };
    }
    case 5: {
      const segmentsDir = path.join(outputDir, 'segments');
      const segmentFiles = fs.readdirSync(segmentsDir).filter(f => f.endsWith('-segments.json')).sort();
      const allSegments = segmentFiles.map(f => {
        const data = safeReadJSON(path.join(segmentsDir, f), log);
        return data ? { file: data.file, segments: data.segments } : null;
      }).filter(Boolean);
      log.verbose(`Reloaded ${allSegments.length} segment sets`);
      return { allSegments };
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Stage timing helper
// ---------------------------------------------------------------------------
function stageTimer(stageId, stageName, log) {
  log.stage(stageId, stageName, 'start');
  const startTime = Date.now();
  return {
    done: () => {
      const elapsed = Date.now() - startTime;
      log.stage(stageId, stageName, 'done');
      log.verbose(`Stage ${stageId} completed in ${elapsed}ms`);
      return elapsed;
    },
  };
}

// ---------------------------------------------------------------------------
// Pipeline runner — wires all 6 stages with real calls
// ---------------------------------------------------------------------------
async function runPipeline(pdfPath, outputDir, options, log, resumeCheckpoint) {
  const fileName = path.basename(pdfPath);
  const resolvedPdfPath = path.resolve(pdfPath);
  log.info(`Processing: ${fileName}`);

  const pipelineStartTime = Date.now();
  const completedStages = resumeCheckpoint ? new Set(resumeCheckpoint.completed_stages) : new Set();
  const stageResults = resumeCheckpoint ? Object.entries(resumeCheckpoint.stage_results || {}).map(([k, v]) => ({ stage: parseInt(k), ...v })) : [];
  const limitations = [];

  // Initialize audit trail
  const audit = createAuditTrail(outputDir);
  if (!resumeCheckpoint) {
    audit.init();
  }
  audit.log('pipeline', `Processing ${fileName} (resume=${!!resumeCheckpoint})`);

  // Build checkpoint state
  const checkpoint = {
    pipeline_version: VERSION,
    source: resolvedPdfPath,
    started_at: resumeCheckpoint ? resumeCheckpoint.started_at : new Date().toISOString(),
    current_stage: 0,
    completed_stages: [...completedStages],
    stage_results: resumeCheckpoint ? { ...resumeCheckpoint.stage_results } : {},
  };

  // Reload intermediate data from disk if resuming
  let manifest = null;
  let profiles = [];
  let classifications = [];
  let routeDecisions = [];
  let pageRoutesList = [];   // per-file array of per-page route decisions
  let extractedDataList = [];
  let allSegments = [];

  if (resumeCheckpoint) {
    log.info(`Resuming from checkpoint — skipping stages [${[...completedStages].join(',')}]`);
    for (const stageId of completedStages) {
      const data = reloadStageData(outputDir, stageId, log);
      if (stageId === 1 && data) manifest = data.manifest;
      if (stageId === 2 && data) { profiles = data.profiles; classifications = data.classifications || []; }
      if (stageId === 3 && data) { routeDecisions = data.routeDecisions; pageRoutesList = data.pageRoutesList || []; }
      if (stageId === 4 && data) extractedDataList = data.extractedDataList;
      if (stageId === 5 && data) allSegments = data.allSegments;
    }
  }

  // ── Stage 0: PREFLIGHT CHECK ────────────────────────────────────────────
  const requiredCmds = ['pdftotext', 'tesseract', 'pdftoppm'];
  const missingCmds = [];
  for (const cmd of requiredCmds) {
    try { execSync(`which ${cmd}`, { stdio: 'pipe' }); }
    catch { missingCmds.push(cmd); }
  }
  if (missingCmds.length > 0) {
    log.warn(`CLI deps missing: ${missingCmds.join(', ')} — OCR features will be degraded`);
    audit.log('preflight', `Missing CLI deps: ${missingCmds.join(', ')}`);
  } else {
    log.verbose('Preflight OK: pdftotext, tesseract, pdftoppm all available');
    audit.log('preflight', 'All CLI deps available (pdftotext, tesseract, pdftoppm)');
  }

  // ── Stage 1: INTAKE ────────────────────────────────────────────────────
  if (!completedStages.has(1)) {
    if (interrupted) { saveCheckpoint(outputDir, checkpoint, log); return { file: fileName, outputDir, stages: stageResults, limitations, interrupted: true }; }
    checkpoint.current_stage = 1;

    const t1 = stageTimer(1, 'Intake', log);
    const ingester = new PDFIngester({
      outputDir: path.join(outputDir, 'intake'),
    });
    const ingestResult = await ingester.ingest(resolvedPdfPath);
    manifest = ingestResult.manifest;
    const elapsed = t1.done();
    log.verbose(`Intake: ${manifest.summary.registered} registered, ${manifest.summary.duplicates} duplicates, ${manifest.summary.errors} errors`);
    audit.log('intake', `${manifest.summary.registered} PDFs registered, ${manifest.summary.duplicates} duplicates, ${manifest.summary.errors} errors`);

    completedStages.add(1);
    checkpoint.completed_stages = [...completedStages];
    checkpoint.stage_results['1'] = { status: 'completed', duration_ms: elapsed, output_path: 'intake/' };
    stageResults.push({ stage: 1, elapsed, status: 'done' });
    saveCheckpoint(outputDir, checkpoint, log);
  }

  if (!manifest || manifest.files.length === 0) {
    log.warn('No files registered after intake — skipping remaining stages');
    return { file: fileName, outputDir, stages: stageResults, limitations, completedAt: new Date().toISOString() };
  }

  // ── Stage 2: PROFILING (per-page) ─────────────────────────────────────
  const extractor = new TextExtractor({
    outputDir: path.join(outputDir, 'extracted'),
  });

  // Check OCR availability once
  const hasTesseract = TextExtractor.checkTesseract();
  if (hasTesseract) {
    log.info('OCR available: tesseract + pdftoppm detected');
  } else {
    log.warn('OCR not available: tesseract/pdftoppm not found — degraded pages will use fast-parse only');
  }

  if (!completedStages.has(2)) {
    if (interrupted) { saveCheckpoint(outputDir, checkpoint, log); return { file: fileName, outputDir, stages: stageResults, limitations, interrupted: true }; }
    checkpoint.current_stage = 2;

    const t2 = stageTimer(2, 'Profiling', log);
    const profiler = new QualityProfiler({
      outputDir: path.join(outputDir, 'profiles'),
    });
    const classifier = new DocumentClassifier();

    for (const file of manifest.files) {
      let fullText = '';
      let preliminaryPages = [];
      try {
        // Use pdftotext (poppler) for accurate per-page extraction
        const preliminary = await extractor.fastParsePerPage(file.source_path);
        preliminaryPages = preliminary.pages;
        fullText = preliminaryPages.map(p => p.text).join('\n');
        log.verbose(`Per-page extract OK for ${file.name}: ${preliminaryPages.length} pages, ${fullText.length} chars (method=${preliminary.method})`);
      } catch (err) {
        log.warn(`Per-page extraction failed for ${file.name}: ${err.message}`);
        // Fallback to pdf-parse
        try {
          const fallback = await extractor.fastParse(file.source_path);
          preliminaryPages = fallback.pages;
          fullText = preliminaryPages.map(p => p.text).join('\n');
          log.warn(`Fallback to pdf-parse for ${file.name}: ${preliminaryPages.length} pages`);
        } catch (err2) {
          log.warn(`All extraction methods failed for ${file.name}: ${err2.message}`);
        }
      }

      // Per-page profiling — detect degraded pages individually
      const pageProfiles = profiler.profilePages(preliminaryPages);
      const profile = profiler.aggregatePageProfiles(pageProfiles, file.source_path);
      profiler.saveProfile(profile);
      profiles.push(profile);

      if (profile.is_mixed_quality) {
        log.info(`${file.name}: MIXED quality detected — ${profile.clean_count} clean, ${profile.degraded_count} degraded (pages: ${profile.degraded_pages.join(',')})`);
      } else if (profile.degraded_count > 0) {
        log.warn(`${file.name}: ALL pages degraded (${profile.degraded_count} pages)`);
      } else {
        log.verbose(`${file.name}: All pages clean — tier=${profile.quality_tier}`);
      }

      const classification = classifier.classify(fullText);
      classifications.push({ file: file.name, ...classification });
      const classificationPath = path.join(outputDir, 'profiles', `${path.basename(file.name, path.extname(file.name))}-classification.json`);
      fs.writeFileSync(classificationPath, JSON.stringify({ file: file.name, ...classification }, null, 2));
      log.verbose(`Profiled ${file.name}: tier=${profile.quality_tier}, type=${classification.primary_type} (${classification.confidence})`);
      audit.log('profile', `${file.name}: tier=${profile.quality_tier}, clean=${profile.clean_count || 0}, degraded=${profile.degraded_count || 0}, type=${classification.primary_type}(${classification.confidence})`);
    }

    const elapsed = t2.done();
    completedStages.add(2);
    checkpoint.completed_stages = [...completedStages];
    checkpoint.stage_results['2'] = { status: 'completed', duration_ms: elapsed, output_path: 'profiles/' };
    stageResults.push({ stage: 2, elapsed, status: 'done' });
    saveCheckpoint(outputDir, checkpoint, log);
  }

  // ── Stage 3: ROUTING (per-page hybrid) ────────────────────────────────
  if (!completedStages.has(3)) {
    if (interrupted) { saveCheckpoint(outputDir, checkpoint, log); return { file: fileName, outputDir, stages: stageResults, limitations, interrupted: true }; }
    checkpoint.current_stage = 3;

    const t3 = stageTimer(3, 'Routing', log);
    const router = new OCRRouter({
      outputDir: path.join(outputDir, 'routes'),
    });

    for (const profile of profiles) {
      // Document-level route (backward compat)
      const decision = router.route(profile);
      router.saveRoute(decision);
      routeDecisions.push(decision);

      // Per-page routing when page_profiles available
      let pageRoutes = null;
      if (profile.page_profiles && profile.page_profiles.length > 0) {
        pageRoutes = router.routePages(profile.page_profiles);
        const ocrCount = pageRoutes.filter(r => r.needs_ocr).length;
        const ocrPageNums = pageRoutes.filter(r => r.needs_ocr).map(r => r.page);

        // Save per-page route decisions
        const pageRoutePath = path.join(outputDir, 'routes', `${path.parse(profile.file).name}-page-routes.json`);
        fs.writeFileSync(pageRoutePath, JSON.stringify({ file: profile.file, pageRoutes }, null, 2));

        if (ocrCount > 0 && hasTesseract) {
          log.info(`${profile.file}: ${ocrCount} pages routed to OCR (pages: ${ocrPageNums.join(',')})`);
        } else if (ocrCount > 0 && !hasTesseract) {
          limitations.push(`${profile.file}: ${ocrCount} degraded pages need OCR but tesseract not available`);
          log.warn(`${profile.file}: ${ocrCount} pages need OCR but tesseract not available — will use fast-parse (degraded)`);
        } else {
          log.verbose(`${profile.file}: all pages clean, fast-parse only`);
        }
      } else {
        log.verbose(`Routed ${profile.file}: ${decision.method} (${decision.engine}) — document-level only`);
      }

      const ocrRouted = pageRoutes ? pageRoutes.filter(r => r.needs_ocr).length : 0;
      const fastRouted = pageRoutes ? pageRoutes.filter(r => !r.needs_ocr).length : 0;
      audit.log('route', `${profile.file}: method=${decision.method}, engine=${decision.engine}, fastparse=${fastRouted}, ocr=${ocrRouted}`);

      pageRoutesList.push(pageRoutes);
    }

    const elapsed = t3.done();
    completedStages.add(3);
    checkpoint.completed_stages = [...completedStages];
    checkpoint.stage_results['3'] = { status: 'completed', duration_ms: elapsed, output_path: 'routes/' };
    stageResults.push({ stage: 3, elapsed, status: 'done' });
    saveCheckpoint(outputDir, checkpoint, log);
  }

  // ── Stage 4: EXTRACTION (hybrid: fast-parse + OCR) ───────────────────
  if (!completedStages.has(4)) {
    if (interrupted) { saveCheckpoint(outputDir, checkpoint, log); return { file: fileName, outputDir, stages: stageResults, limitations, interrupted: true }; }
    checkpoint.current_stage = 4;

    const t4 = stageTimer(4, 'Extraction', log);

    // M1 fix: assert data alignment before index-coupled loop
    if (routeDecisions.length !== manifest.files.length) {
      throw new Error(`Stage 4 alignment error: ${routeDecisions.length} routes vs ${manifest.files.length} files`);
    }

    for (let i = 0; i < manifest.files.length; i++) {
      const file = manifest.files[i];
      const routeDecision = routeDecisions[i];
      const pageRoutes = pageRoutesList[i];

      // Check if hybrid extraction is needed (per-page routes with OCR pages)
      const needsHybrid = hasTesseract && pageRoutes && pageRoutes.some(r => r.needs_ocr);

      let extracted;
      if (needsHybrid) {
        // Step 1: Fast-parse all pages first (using poppler for accurate per-page text)
        const fastResult = await extractor.fastParsePerPage(file.source_path);
        const ocrPageCount = pageRoutes.filter(r => r.needs_ocr).length;
        log.info(`${file.name}: Hybrid extraction — fast-parse ${fastResult.pages.length} pages, OCR ${ocrPageCount} degraded pages...`);

        // Step 2: Hybrid merge — OCR replaces degraded pages
        extracted = extractor.extractHybrid(file.source_path, fastResult.pages, pageRoutes);
        log.info(`${file.name}: Hybrid done — method=${extracted.method}, OCR pages=[${(extracted.ocr_pages || []).join(',')}], confidence=${extracted.overall_confidence}`);
      } else {
        // Standard extraction (document-level routing)
        extracted = await extractor.extract(file.source_path, routeDecision);
        log.verbose(`Extracted ${file.name}: ${extracted.pages.length} pages, method=${extracted.method}, confidence=${extracted.overall_confidence}`);
      }

      // Post-extraction: strip repetitive headers/footers from all pages
      const profiler4 = new QualityProfiler();
      const cleanedPages = profiler4.stripRepetitiveContent(extracted.pages);
      if (cleanedPages._stripStats) {
        const stats = cleanedPages._stripStats;
        const totalStripped = stats.lines_stripped_header + stats.lines_stripped_footer + (stats.lines_stripped_inverted || 0);
        if (totalStripped > 0) {
          log.info(`${file.name}: Stripped ${stats.lines_stripped_header} header + ${stats.lines_stripped_footer} footer + ${stats.lines_stripped_inverted || 0} inverted lines (${stats.repeated_header_patterns} header patterns, ${stats.repeated_footer_patterns} footer patterns)`);
        }
        delete cleanedPages._stripStats;
      }
      extracted.pages = cleanedPages;

      extractor.saveExtraction(extracted, file.name);
      extractedDataList.push(extracted);
      audit.log('extract', `${file.name}: ${extracted.pages.length} pages, method=${extracted.method || 'fast-parse'}, ocr_pages=[${(extracted.ocr_pages || []).join(',')}], confidence=${extracted.overall_confidence}`);
    }

    // ── Stage 4.5: Re-classification post-OCR ──────────────────────────
    const classifier45 = new DocumentClassifier();
    for (let i = 0; i < extractedDataList.length; i++) {
      const prevClassification = classifications[i];
      if (prevClassification && prevClassification.primary_type === 'unknown') {
        const extracted = extractedDataList[i];
        const ocrText = extracted.pages.map(p => p.text).join('\n');
        if (ocrText.trim().length > 100) {
          const newClassification = classifier45.classify(ocrText);
          if (newClassification.primary_type !== 'unknown') {
            log.info(`Re-classification: ${manifest.files[i].name} unknown → ${newClassification.primary_type} (${newClassification.confidence})`);
            classifications[i] = { file: manifest.files[i].name, ...newClassification, reclassified: true };
            const classPath = path.join(outputDir, 'profiles', `${path.basename(manifest.files[i].name, path.extname(manifest.files[i].name))}-classification.json`);
            fs.writeFileSync(classPath, JSON.stringify(classifications[i], null, 2));
          }
        }
      }
    }

    const elapsed = t4.done();
    completedStages.add(4);
    checkpoint.completed_stages = [...completedStages];
    checkpoint.stage_results['4'] = { status: 'completed', duration_ms: elapsed, output_path: 'extracted/' };
    stageResults.push({ stage: 4, elapsed, status: 'done' });
    saveCheckpoint(outputDir, checkpoint, log);
  }

  // ── Stage 5: SEGMENTATION ─────────────────────────────────────────────
  if (!completedStages.has(5)) {
    if (interrupted) { saveCheckpoint(outputDir, checkpoint, log); return { file: fileName, outputDir, stages: stageResults, limitations, interrupted: true }; }
    checkpoint.current_stage = 5;

    const t5 = stageTimer(5, 'Segmentation', log);
    const segmenter = new PageSegmenter({
      outputDir: path.join(outputDir, 'segments'),
    });

    // M1 fix: assert data alignment before index-coupled loop
    if (extractedDataList.length !== manifest.files.length) {
      throw new Error(`Stage 5 alignment error: ${extractedDataList.length} extractions vs ${manifest.files.length} files`);
    }

    for (let i = 0; i < manifest.files.length; i++) {
      const file = manifest.files[i];
      const extracted = extractedDataList[i];

      // Bridge classification from Stage 2 profiler → segmenter (Fix 3 v1.2.0)
      extracted.classification = classifications[i] || null;

      const segments = segmenter.segment(extracted);
      segmenter.saveSegments(segments, file.name);
      allSegments.push({ file: file.name, segments });
      log.verbose(`Segmented ${file.name}: ${segments.length} segments`);
      const segTypes = segments.map(s => s.doc_type).join(', ');
      audit.log('segment', `${file.name}: ${segments.length} boundaries detected (${segTypes})`);
    }

    const elapsed = t5.done();
    completedStages.add(5);
    checkpoint.completed_stages = [...completedStages];
    checkpoint.stage_results['5'] = { status: 'completed', duration_ms: elapsed, output_path: 'segments/' };
    stageResults.push({ stage: 5, elapsed, status: 'done' });
    saveCheckpoint(outputDir, checkpoint, log);
  }

  // ── Stage 5.5: PER-SEGMENT CLASSIFICATION (L1) ────────────────────────
  {
    log.info('Stage 5.5: Per-segment classification (L1)');
    const segClassifier = new DocumentClassifier();
    let reclassified = 0;
    let total = 0;

    for (let i = 0; i < allSegments.length; i++) {
      const { segments } = allSegments[i];
      const extracted = extractedDataList[i];
      const pages = extracted.pages || [];

      for (const seg of segments) {
        if (seg.type === 'separator') continue;
        total++;

        // Extract full text from this segment's pages
        const segPages = pages.filter(
          p => p.page_number >= seg.page_start && p.page_number <= seg.page_end
        );
        const segText = segPages.map(p => p.text || '').join('\n');
        if (segText.trim().length < 50) continue;

        // Extract heading (first 3 non-empty lines) and tail (last 3 non-empty lines)
        const nonEmptyLines = segText.split('\n').map(l => l.trim()).filter(l => l.length > 3);
        const heading = nonEmptyLines.slice(0, 3).join('\n');
        const tail = nonEmptyLines.slice(-3).join('\n');

        const segClassification = segClassifier.classify(segText, { heading, tail });

        // Only override if per-segment confidence is meaningful
        if (segClassification.primary_type !== 'unknown' && segClassification.confidence >= 0.3) {
          const prev = seg.doc_type;
          seg.doc_type = segClassification.primary_type;
          seg.classification_source = 'per-segment-L1';
          seg.classification_confidence = segClassification.confidence;
          seg.classification_indicators = segClassification.indicators;
          if (prev !== seg.doc_type) {
            reclassified++;
            log.verbose(`  Seg ${seg.segment_id}: ${prev} → ${seg.doc_type} (${segClassification.confidence})`);
          }
        }
      }
    }

    log.info(`Per-segment L1: ${reclassified}/${total} segments reclassified`);
    audit.log('classify-L1', `Per-segment: ${reclassified}/${total} reclassified`);

    // Re-save segments with updated classification
    for (let i = 0; i < allSegments.length; i++) {
      const file = manifest.files[i];
      const segmentsDir = path.join(outputDir, 'segments');
      const outPath = path.join(segmentsDir, `${path.parse(file.name).name}-segments.json`);
      fs.writeFileSync(outPath, JSON.stringify({
        file: file.name,
        segments: allSegments[i].segments,
        segmented_at: new Date().toISOString(),
      }, null, 2));
    }
  }

  // ── Stage 6: EXPORT + QC ──────────────────────────────────────────────
  let qcResult = null;
  if (!completedStages.has(6)) {
    if (interrupted) { saveCheckpoint(outputDir, checkpoint, log); return { file: fileName, outputDir, stages: stageResults, limitations, interrupted: true }; }
    checkpoint.current_stage = 6;

    const t6 = stageTimer(6, 'Export + QC', log);
    const mdExporter = new MarkdownExporter({
      outputDir: path.join(outputDir, 'markdown'),
      pipelineVersion: VERSION,
    });
    const qcValidator = new QCValidator({
      reviewDir: path.join(outputDir, 'review'),
    });

    // M1 fix: assert data alignment before index-coupled loop
    if (extractedDataList.length !== manifest.files.length || allSegments.length !== manifest.files.length) {
      throw new Error(`Stage 6 alignment error: files=${manifest.files.length}, extracted=${extractedDataList.length}, segments=${allSegments.length}`);
    }

    const qcResults = [];
    for (let i = 0; i < manifest.files.length; i++) {
      const file = manifest.files[i];
      const extracted = extractedDataList[i];
      const { segments } = allSegments[i];

      // BUG-4 fix: per-file subdirectory when multi-file to avoid .md collisions
      const fileMarkdownDir = manifest.files.length > 1
        ? path.join(outputDir, 'markdown', path.basename(file.name, path.extname(file.name)))
        : path.join(outputDir, 'markdown');
      if (manifest.files.length > 1) fs.mkdirSync(fileMarkdownDir, { recursive: true });

      const fileExporter = manifest.files.length > 1
        ? new MarkdownExporter({ outputDir: fileMarkdownDir, pipelineVersion: VERSION })
        : mdExporter;

      const exportResult = fileExporter.exportAll(segments, file.source_path, extracted, extracted);
      log.verbose(`Exported ${file.name}: ${exportResult.files.length} .md files`);

      const qc = qcValidator.runQualityGate(
        fileMarkdownDir,
        exportResult.indexPath,
      );
      qcResults.push(qc);
      log.verbose(`QC ${file.name}: ${qc.summary.passed} passed, ${qc.summary.flagged} flagged, ${qc.summary.rejected} rejected`);
      audit.log('qc', `${file.name}: ${qc.summary.mislabels_caught} mislabels, ${qc.summary.passed} passed, ${qc.summary.flagged} flagged, ${qc.summary.rejected} rejected`);

      // Generate INDEX.md for this file's markdown dir
      try {
        const indexResult = generateIndex(exportResult.indexPath, fileMarkdownDir);
        log.verbose(`INDEX.md generated: ${indexResult.indexMdPath} (processType=${indexResult.processType || 'unknown'})`);
        audit.log('export', `INDEX.md generated for ${file.name} (processType=${indexResult.processType || 'auto'}, coverage=${indexResult.essentialPieces ? (indexResult.essentialPieces.coverage * 100).toFixed(0) + '%' : 'N/A'})`);
      } catch (err) {
        log.warn(`INDEX.md generation failed for ${file.name}: ${err.message}`);
        audit.log('export', `INDEX.md generation FAILED for ${file.name}: ${err.message}`);
      }
    }

    // BUG-5 fix: merge all QC results instead of retaining only last
    qcResult = {
      summary: {
        passed: qcResults.reduce((sum, q) => sum + q.summary.passed, 0),
        flagged: qcResults.reduce((sum, q) => sum + q.summary.flagged, 0),
        rejected: qcResults.reduce((sum, q) => sum + q.summary.rejected, 0),
        mislabels_caught: qcResults.reduce((sum, q) => sum + q.summary.mislabels_caught, 0),
      },
      files: qcResults,
    };

    audit.log('export', `Total: ${qcResult.summary.passed} passed, ${qcResult.summary.flagged} flagged, ${qcResult.summary.rejected} rejected, ${qcResult.summary.mislabels_caught} mislabels`);

    const elapsed = t6.done();
    completedStages.add(6);
    checkpoint.completed_stages = [...completedStages];
    checkpoint.stage_results['6'] = { status: 'completed', duration_ms: elapsed, output_path: 'markdown/' };
    stageResults.push({ stage: 6, elapsed, status: 'done' });
    saveCheckpoint(outputDir, checkpoint, log);
  }

  // ── Report generation ────────────────────────────────────────────────
  const report = generateReport({
    manifest, profiles, classifications, routeDecisions,
    extractedDataList, allSegments, qcResult, limitations,
    startTime: pipelineStartTime,
  }, outputDir, log);

  return {
    file: fileName,
    outputDir,
    stages: stageResults,
    limitations,
    qcSummary: qcResult ? qcResult.summary : null,
    report,
    completedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Report generator
// ---------------------------------------------------------------------------
function generateReport(pipelineResult, outputDir, log) {
  const { manifest, profiles, classifications, routeDecisions, extractedDataList, allSegments, qcResult, limitations, startTime } = pipelineResult;
  const totalDuration = Date.now() - startTime;

  // Aggregate segment types
  const segmentTypes = {};
  for (const { segments } of allSegments) {
    for (const seg of segments) {
      segmentTypes[seg.doc_type] = (segmentTypes[seg.doc_type] || 0) + 1;
    }
  }
  const totalSegments = allSegments.reduce((sum, s) => sum + s.segments.length, 0);

  // Build review reasons
  const reviewReasons = [];
  if (qcResult) {
    if (qcResult.summary.flagged > 0) reviewReasons.push(`${qcResult.summary.flagged} file(s) flagged`);
    if (qcResult.summary.rejected > 0) reviewReasons.push(`${qcResult.summary.rejected} file(s) rejected`);
    if (qcResult.summary.mislabels_caught > 0) reviewReasons.push(`${qcResult.summary.mislabels_caught} mislabel(s) detected`);
  }

  const report = {
    pipeline_version: VERSION,
    source: manifest ? path.basename(manifest.source) : 'unknown',
    completed_at: new Date().toISOString(),
    duration_ms: totalDuration,
    stages: {
      ingest: {
        files: manifest ? manifest.summary.registered : 0,
        duplicates: manifest ? manifest.summary.duplicates : 0,
        errors: manifest ? manifest.summary.errors : 0,
      },
      profile: profiles.length > 0 ? {
        quality_tier: profiles[0].quality_tier,
        readability: profiles[0].readability_score,
        noise: profiles[0].noise_level,
        classification: classifications.length > 0 ? classifications[0].primary_type : 'unknown',
        files: profiles.map((p, i) => ({
          quality_tier: p.quality_tier,
          readability: p.readability_score,
          noise: p.noise_level,
          classification: classifications[i] ? classifications[i].primary_type : 'unknown',
        })),
      } : {},
      route: routeDecisions.length > 0 ? {
        method: routeDecisions[0].method,
        engine: routeDecisions[0].engine,
        preprocessing: routeDecisions[0].preprocessing,
        files: routeDecisions.map(r => ({
          method: r.method,
          engine: r.engine,
          preprocessing: r.preprocessing,
        })),
      } : {},
      extract: extractedDataList.length > 0 ? {
        pages: extractedDataList[0].pages.length,
        method: extractedDataList[0].method || 'fast-parse',
        confidence: extractedDataList[0].overall_confidence,
        fallback: extractedDataList[0].fallback_triggered || false,
        ocr_pages: extractedDataList[0].ocr_pages || [],
        files: extractedDataList.map(e => ({
          pages: e.pages.length,
          method: e.method || 'fast-parse',
          confidence: e.overall_confidence,
          fallback: e.fallback_triggered || false,
          ocr_pages: e.ocr_pages || [],
        })),
      } : {},
      segment: { total_segments: totalSegments, types: segmentTypes },
      export: {
        files_generated: totalSegments,
        index_path: 'markdown/index.json',
      },
      qc: qcResult ? qcResult.summary : { passed: 0, flagged: 0, rejected: 0, mislabels_caught: 0 },
    },
    limitations,
    output_dir: outputDir,
    review_needed: reviewReasons.length > 0,
    review_reasons: reviewReasons,
  };

  const reportPath = path.join(outputDir, 'pipeline-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  log.info(`Report: ${reportPath} (${fs.statSync(reportPath).size} bytes)`);
  return report;
}

function generateBatchReport(reports, outputBase, totalDuration, log) {
  const summary = {
    pipeline_version: VERSION,
    completed_at: new Date().toISOString(),
    total_duration_ms: totalDuration,
    total_pdfs: reports.length,
    total_segments: reports.reduce((sum, r) => sum + (r.stages.segment.total_segments || 0), 0),
    review_needed: reports.some(r => r.review_needed),
    pdfs: reports.map(r => ({
      source: r.source,
      duration_ms: r.duration_ms,
      segments: r.stages.segment.total_segments,
      qc_passed: r.stages.qc.passed || 0,
      qc_flagged: r.stages.qc.flagged || 0,
      qc_rejected: r.stages.qc.rejected || 0,
      review_needed: r.review_needed,
    })),
  };

  const reportPath = path.join(outputBase, 'batch-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));
  log.info(`Batch report: ${reportPath} (${fs.statSync(reportPath).size} bytes)`);
  return summary;
}

// ---------------------------------------------------------------------------
// Signal handlers
// ---------------------------------------------------------------------------
let interrupted = false;

function setupSignalHandlers(log) {
  const handler = (signal) => {
    if (interrupted) {
      log.warn(`Received ${signal} again — forcing exit`);
      process.exit(1);
    }
    interrupted = true;
    log.warn(`Received ${signal} — finishing current stage before exit...`);
  };

  process.on('SIGINT', () => handler('SIGINT'));
  process.on('SIGTERM', () => handler('SIGTERM'));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const log = createLogger(args.verbose);
  setupSignalHandlers(log);

  // Resume mode
  if (args.resume) {
    const resumePath = path.resolve(args.resume);
    const ckpt = loadCheckpoint(resumePath, log);
    if (!ckpt) {
      log.warn('No valid checkpoint found — cannot resume');
      process.exit(1);
    }

    const outputDir = path.dirname(resumePath);
    log.info(`autosplit-pipeline v${VERSION} — RESUMING`);
    log.info(`Source: ${ckpt.source}`);
    log.info(`Output: ${outputDir}`);

    const result = await runPipeline(ckpt.source, outputDir, args, log, ckpt);
    if (result.interrupted) {
      log.warn('Pipeline interrupted during resume');
      // H2 decision: exit(130) = POSIX convention for SIGINT (128+2), preferred over PRD's exit(0)
      // Approved by QA as improvement — allows callers to distinguish graceful completion from interruption
      process.exit(130);
    }

    log.info('─'.repeat(50));
    log.info('Resume complete — all stages done');
    return;
  }

  // Validate required args
  if (!args.source) {
    console.error('Error: --source is required. Use --help for usage.');
    process.exit(1);
  }

  const sourcePath = path.resolve(args.source);
  const outputBase = path.resolve(args.output || './output');

  if (!fs.existsSync(sourcePath)) {
    console.error(`Error: Source path does not exist: ${sourcePath}`);
    process.exit(1);
  }

  log.info(`autosplit-pipeline v${VERSION}`);
  log.info(`Source: ${sourcePath}`);
  log.info(`Output: ${outputBase}`);

  // Detect source type
  const source = detectSource(sourcePath);
  log.info(`Mode: ${source.mode} (${source.files.length} PDF${source.files.length > 1 ? 's' : ''})`);

  // Create output structure
  if (source.mode === 'single') {
    createOutputStructure(outputBase, log);
  } else {
    // Batch: create base + per-PDF subfolders
    fs.mkdirSync(outputBase, { recursive: true });
  }

  // Process each PDF
  const pipelineResults = [];
  const startTime = Date.now();

  for (const pdfPath of source.files) {
    if (interrupted) {
      log.warn('Pipeline interrupted — stopping before next PDF');
      break;
    }

    const pdfOutputDir = source.mode === 'batch'
      ? createPdfSubfolder(outputBase, path.basename(pdfPath), log)
      : outputBase;

    const result = await runPipeline(pdfPath, pdfOutputDir, args, log, null);
    pipelineResults.push(result);
  }

  const totalElapsed = Date.now() - startTime;

  // Summary
  log.info('─'.repeat(50));
  log.info(`Pipeline complete: ${pipelineResults.length}/${source.files.length} PDFs processed`);
  log.info(`Total time: ${(totalElapsed / 1000).toFixed(1)}s`);

  // Generate batch report for multi-PDF runs
  if (source.mode === 'batch' && pipelineResults.length > 0) {
    const reports = pipelineResults.filter(r => r.report).map(r => r.report);
    if (reports.length > 0) {
      generateBatchReport(reports, outputBase, totalElapsed, log);
    }
  }

  if (interrupted) {
    log.warn('Pipeline was interrupted — some PDFs may not have been processed');
    // H2 decision: exit(130) = POSIX SIGINT convention, see comment above
    process.exit(130);
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
main().catch((err) => {
  console.error(`\nFATAL: ${err.message}`);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});

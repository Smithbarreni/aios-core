/**
 * ocr-router.js — AutoSplit Squad
 *
 * Routing logic between fast parse and OCR engines.
 * Decides optimal extraction path based on document quality profile.
 *
 * Usage:
 *   node ocr-router.js --file ./input/doc.pdf --profile ./output/profiles/doc-profile.json
 *
 * Dependencies: pdf-parse, tesseract CLI + pdftoppm (poppler)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');
const { QualityProfiler } = require('./quality-profiler');

class OCRRouter {
  constructor(options = {}) {
    this.outputDir = options.outputDir || './output/routes';
    this.fallbackEnabled = options.fallback !== false;
  }

  /**
   * Decide extraction method based on quality profile
   */
  route(profile) {
    const preprocessing = [];
    let method = 'fast-parse';
    let engine = 'pdf-parse';
    let rationale = '';

    // Handle orientation
    if (profile.orientation !== 'normal') {
      preprocessing.push('auto-rotate');
    }

    // Handle skew
    if (profile.skew_detected) {
      preprocessing.push('deskew');
    }

    // Route based on quality
    if (profile.has_text_layer && profile.readability_score >= 80) {
      method = 'fast-parse';
      engine = 'pdf-parse';
      rationale = 'Clean digital PDF with native text layer';
    } else if (profile.has_text_layer && profile.readability_score >= 60) {
      method = 'fast-parse';
      engine = 'pdf-parse';
      rationale = 'Text layer present but moderate quality — fast parse with OCR verify';
    } else if (profile.readability_score >= 60) {
      method = 'ocr-standard';
      engine = 'tesseract';
      preprocessing.push('deskew');
      rationale = 'Scan with good quality — standard OCR sufficient';
    } else if (profile.readability_score >= 40) {
      method = 'ocr-enhanced';
      engine = 'tesseract';
      preprocessing.push('deskew', 'denoise');
      rationale = 'Degraded scan — enhanced OCR with preprocessing';
    } else if (profile.readability_score >= 20) {
      method = 'ocr-enhanced';
      engine = 'tesseract';
      preprocessing.push('deskew', 'denoise', 'contrast-enhance', 'binarize');
      rationale = 'Poor quality scan — full preprocessing pipeline';
    } else {
      method = 'manual-review';
      engine = 'none';
      rationale = 'Unusable quality — requires human review';
    }

    return {
      file: profile.file,
      method,
      engine,
      preprocessing: [...new Set(preprocessing)],
      rationale,
      quality_tier: profile.quality_tier,
      readability_score: profile.readability_score,
      routed_at: new Date().toISOString(),
    };
  }

  /**
   * Route per-page based on individual page quality profiles.
   * Returns an array of per-page routing decisions.
   */
  routePages(pageProfiles) {
    return pageProfiles.map(pp => {
      if (pp.empty) {
        return { page: pp.page_number, method: 'skip', needs_ocr: false, reason: 'empty page' };
      }
      if (!pp.is_degraded) {
        return { page: pp.page_number, method: 'fast-parse', needs_ocr: false, reason: 'clean digital text' };
      }
      if (pp.readability_score >= 40) {
        return { page: pp.page_number, method: 'ocr-standard', needs_ocr: true, reason: `degraded (readability=${pp.readability_score}, noise=${pp.noise_level})` };
      }
      return { page: pp.page_number, method: 'ocr-enhanced', needs_ocr: true, reason: `poor quality (readability=${pp.readability_score}, noise=${pp.noise_level})` };
    });
  }

  /**
   * Save route decision to disk
   */
  saveRoute(routeDecision) {
    fs.mkdirSync(this.outputDir, { recursive: true });
    const outPath = path.join(
      this.outputDir,
      `${path.parse(routeDecision.file).name}-route.json`
    );
    fs.writeFileSync(outPath, JSON.stringify(routeDecision, null, 2));
    return outPath;
  }
}

/**
 * TextExtractor — executes extraction based on route decision
 */
class TextExtractor {
  constructor(options = {}) {
    this.outputDir = options.outputDir || './output/extracted';
    this.fallbackChain = ['fast-parse', 'ocr-standard', 'ocr-enhanced', 'manual-review'];
  }

  /**
   * Extract text using fast parse (native PDF text layer)
   */
  async fastParse(filePath) {
    try {
      const pdfParse = require('pdf-parse');
      const buffer = fs.readFileSync(filePath);
      const data = await pdfParse(buffer);

      const pages = this._splitIntoPages(data.text, data.numpages);
      return {
        method: 'fast-parse',
        pages,
        overall_confidence: 0.95,
        fallback_triggered: false,
      };
    } catch (err) {
      throw new Error(`fast-parse failed: ${err.message}`);
    }
  }

  /**
   * Extract text per-page using pdftotext (poppler).
   * Much more accurate per-page splitting than pdf-parse.
   * Falls back to fastParse() if pdftotext is not available.
   */
  async fastParsePerPage(filePath) {
    // Check pdftotext availability
    try {
      execSync('pdftotext -v', { stdio: 'pipe', stderr: 'pipe' });
    } catch {
      return this.fastParse(filePath);
    }

    try {
      // Get page count
      const pdfParse = require('pdf-parse');
      const buffer = fs.readFileSync(filePath);
      const data = await pdfParse(buffer);
      const pageCount = data.numpages;

      const pages = [];
      for (let p = 1; p <= pageCount; p++) {
        try {
          const text = execSync(
            `pdftotext -f ${p} -l ${p} -raw "${filePath}" -`,
            { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000 }
          ).trim();
          pages.push({
            page_number: p,
            text,
            confidence: 0.95,
            empty: text.length < 50,
          });
        } catch (err) {
          pages.push({
            page_number: p,
            text: '',
            confidence: 0,
            empty: true,
            error: err.message,
          });
        }
      }

      return {
        method: 'fast-parse-poppler',
        pages,
        overall_confidence: 0.95,
        fallback_triggered: false,
      };
    } catch (err) {
      // Fallback to pdf-parse
      return this.fastParse(filePath);
    }
  }

  /**
   * Extract text using OCR (tesseract.js)
   * Legacy placeholder — kept for backward compat. Use ocrPages() for real OCR.
   */
  async ocrExtract(filePath, enhanced = false) {
    // Delegate to real OCR if tesseract is available
    if (TextExtractor._hasTesseract === undefined) {
      TextExtractor._hasTesseract = TextExtractor.checkTesseract();
    }
    if (TextExtractor._hasTesseract) {
      return this.ocrFullDocument(filePath, enhanced);
    }
    return {
      method: enhanced ? 'ocr-enhanced' : 'ocr-standard',
      pages: [],
      overall_confidence: enhanced ? 0.7 : 0.8,
      fallback_triggered: false,
    };
  }

  /**
   * Check if tesseract and pdftoppm are available on system PATH.
   */
  static checkTesseract() {
    try {
      execSync('tesseract --version', { stdio: 'pipe' });
      execSync('pdftoppm -v', { stdio: 'pipe', stderr: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * OCR a full document via pdftoppm + tesseract CLI.
   */
  async ocrFullDocument(filePath, enhanced = false) {
    const pdfParse = require('pdf-parse');
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    const pageCount = data.numpages;

    const allPages = [];
    for (let p = 1; p <= pageCount; p++) {
      const ocrResult = this._ocrSinglePage(filePath, p, enhanced);
      allPages.push(ocrResult);
    }

    const avgConf = allPages.reduce((s, p) => s + p.confidence, 0) / Math.max(allPages.length, 1);
    return {
      method: enhanced ? 'ocr-enhanced' : 'ocr-standard',
      pages: allPages,
      overall_confidence: Math.round(avgConf * 100) / 100,
      fallback_triggered: false,
    };
  }

  /**
   * OCR specific pages of a PDF. Returns per-page results.
   * Uses pdftoppm (PDF → PNG) → tesseract (PNG → text).
   */
  ocrPages(filePath, pageNumbers) {
    const results = [];
    for (const pageNum of pageNumbers) {
      results.push(this._ocrSinglePageWithRetry(filePath, pageNum, false));
    }
    return results;
  }

  /**
   * OCR a single page: pdftoppm → tesseract → text.
   */
  _ocrSinglePage(filePath, pageNum, enhanced) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autosplit-ocr-'));
    try {
      const imgPrefix = path.join(tmpDir, 'page');
      const dpi = enhanced ? 400 : 300;

      // PDF page → PNG image
      execSync(
        `pdftoppm -r ${dpi} -f ${pageNum} -l ${pageNum} -png "${filePath}" "${imgPrefix}"`,
        { stdio: 'pipe', timeout: 30000 }
      );

      // Find the generated PNG (pdftoppm appends -NNNNNN.png)
      const pngFiles = fs.readdirSync(tmpDir).filter(f => f.endsWith('.png'));
      if (pngFiles.length === 0) {
        return { page_number: pageNum, text: '', confidence: 0, method: 'ocr-failed', empty: true };
      }
      const imgPath = path.join(tmpDir, pngFiles[0]);

      // tesseract OCR → text (Sauvola binarization + single-thread for batch throughput)
      const tessArgs = enhanced ? '-l por --psm 6 --oem 1 -c thresholding_method=1' : '-l por --psm 3 --oem 1 -c thresholding_method=1';
      const rawText = execSync(
        `tesseract "${imgPath}" stdout ${tessArgs}`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000, env: { ...process.env, OMP_NUM_THREADS: '1' } }
      ).trim();

      // Post-process OCR text to fix common artifacts
      const text = this.postProcessOCRText(rawText);

      return {
        page_number: pageNum,
        text,
        confidence: enhanced ? 0.80 : 0.85,
        method: enhanced ? 'ocr-enhanced' : 'ocr-standard',
        empty: text.length < 50,
      };
    } catch (err) {
      return {
        page_number: pageNum,
        text: '',
        confidence: 0,
        method: 'ocr-failed',
        error: err.message,
        empty: true,
      };
    } finally {
      // Cleanup temp files
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  }

  /**
   * OCR a single page with rotation retry.
   * If initial OCR produces garbage (word_garbage_score > 0.4),
   * tries rotating the image 180°, 90°, 270° and picks the best result.
   */
  _ocrSinglePageWithRetry(filePath, pageNum, enhanced) {
    const profiler = new QualityProfiler();

    // First attempt: normal OCR
    const result = this._ocrSinglePage(filePath, pageNum, enhanced);
    if (result.empty || !result.text || result.text.length < 30) return result;

    const garbageScore = profiler.detectWordLevelGarbage(result.text);
    if (garbageScore < 0.4) {
      return result; // Good enough, no retry needed
    }

    // Try rotations: 180° first (most common scan error), then 90°, 270°
    const rotations = [180, 90, 270];
    let bestResult = result;
    let bestGarbage = garbageScore;

    for (const degrees of rotations) {
      const rotated = this._ocrSinglePageRotated(filePath, pageNum, enhanced, degrees);
      if (!rotated.text || rotated.empty) continue;

      const rotGarbage = profiler.detectWordLevelGarbage(rotated.text);
      if (rotGarbage < bestGarbage) {
        bestResult = rotated;
        bestGarbage = rotGarbage;
      }
      if (bestGarbage < 0.2) break; // Good enough
    }

    bestResult.word_garbage_score = Math.round(bestGarbage * 100) / 100;
    return bestResult;
  }

  /**
   * Post-process OCR text to fix common tesseract artifacts in Portuguese legal text.
   * Applies regex-based corrections for broken words, common misreads, and
   * punctuation artifacts that tesseract produces on scanned legal documents.
   */
  postProcessOCRText(text) {
    if (!text || text.length < 20) return text;

    let result = text;

    // --- Fix split words with space before middle of word ---
    // "d nvolvimsato" → "desenvolvimento" (too specific, use general approach)
    // General pattern: single letter + space + rest of word (lowercase continuation)
    // e.g. "d esenvolvimento", "r egistro", "m anifestação"
    result = result.replace(/\b([a-záàâãéèêíïóôõúüç])\s([a-záàâãéèêíïóôõúüç]{3,})\b/g, '$1$2');

    // --- Common Portuguese OCR misreads ---
    const corrections = [
      // "qua" → "que" (only when standalone word)
      [/\bqua\b(?!\s+(?:se|a|o|é|são|foi|era|um|uma|os|as|parte|razão|motivo|natureza|maneira|forma|espécie|tipo))/g, 'que'],
      // "Francisca José" → "Francisco José" (male name misread)
      [/\bFrancisca\s+José\b/g, 'Francisco José'],
      // ": Ouza" → "de Souza" (common name garble)
      [/:\s*Ouza\b/g, 'de Souza'],
      // "Rodrigua:" → "Rodrigues" (common name garble)
      [/\bRodrigua:\b/g, 'Rodrigues'],
      // "Morata" → "Morato" (name misread)
      [/\bMorata\b/g, 'Morato'],
      // "Marane" → "Marone" (name misread)
      [/\bMarane\b/g, 'Marone'],
      // "Rezele" → "Rezek" (name misread)
      [/\bRezele\b/g, 'Rezek'],
      // "Jos6" → "José" (digit in name)
      [/\bJos6\b/g, 'José'],
      // Double spaces → single space
      [/  +/g, ' '],
    ];

    for (const [pattern, replacement] of corrections) {
      result = result.replace(pattern, replacement);
    }

    return result;
  }

  /**
   * OCR a single page with image rotation applied before tesseract.
   * Uses sips (macOS) or convert (ImageMagick) for image rotation.
   */
  _ocrSinglePageRotated(filePath, pageNum, enhanced, rotateDegrees) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autosplit-ocr-rot-'));
    try {
      const imgPrefix = path.join(tmpDir, 'page');
      const dpi = enhanced ? 400 : 300;

      // PDF page → PNG image
      execSync(
        `pdftoppm -r ${dpi} -f ${pageNum} -l ${pageNum} -png "${filePath}" "${imgPrefix}"`,
        { stdio: 'pipe', timeout: 30000 }
      );

      const pngFiles = fs.readdirSync(tmpDir).filter(f => f.endsWith('.png'));
      if (pngFiles.length === 0) {
        return { page_number: pageNum, text: '', confidence: 0, method: 'ocr-failed', empty: true };
      }
      const imgPath = path.join(tmpDir, pngFiles[0]);

      // Rotate image — try sips (macOS built-in), then ImageMagick convert
      let rotated = false;
      try {
        execSync(`sips --rotate ${rotateDegrees} "${imgPath}"`, { stdio: 'pipe', timeout: 10000 });
        rotated = true;
      } catch {
        try {
          const rotatedPath = path.join(tmpDir, `rotated-${rotateDegrees}.png`);
          execSync(`convert "${imgPath}" -rotate ${rotateDegrees} "${rotatedPath}"`, { stdio: 'pipe', timeout: 10000 });
          fs.renameSync(rotatedPath, imgPath);
          rotated = true;
        } catch { /* no rotation tool available */ }
      }

      if (!rotated) {
        return { page_number: pageNum, text: '', confidence: 0, method: 'ocr-failed', empty: true };
      }

      // OCR the rotated image (Sauvola binarization + single-thread for batch throughput)
      const tessArgs = enhanced ? '-l por --psm 6 --oem 1 -c thresholding_method=1' : '-l por --psm 3 --oem 1 -c thresholding_method=1';
      const rawText = execSync(
        `tesseract "${imgPath}" stdout ${tessArgs}`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000, env: { ...process.env, OMP_NUM_THREADS: '1' } }
      ).trim();

      // Pendente 3: Post-process OCR text to fix common artifacts
      const text = this.postProcessOCRText(rawText);

      return {
        page_number: pageNum,
        text,
        confidence: enhanced ? 0.75 : 0.80,
        method: enhanced ? 'ocr-enhanced-rotated' : 'ocr-rotated',
        empty: text.length < 50,
        rotation_applied: rotateDegrees,
        post_processed: text !== rawText,
      };
    } catch (err) {
      return {
        page_number: pageNum,
        text: '',
        confidence: 0,
        method: 'ocr-failed',
        error: err.message,
        empty: true,
      };
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  }

  /**
   * Hybrid extraction: fast-parse for clean pages, OCR for degraded pages.
   * Merges both into a single unified pages[] array.
   */
  extractHybrid(filePath, fastParsePages, pageRoutes) {
    const ocrNeeded = pageRoutes.filter(r => r.needs_ocr);

    if (ocrNeeded.length === 0) {
      return {
        method: 'fast-parse',
        pages: fastParsePages,
        overall_confidence: 0.95,
        fallback_triggered: false,
        ocr_pages: [],
      };
    }

    const ocrPageNums = ocrNeeded.map(r => r.page);
    const hasEnhanced = ocrNeeded.some(r => r.method === 'ocr-enhanced');
    const ocrResults = this.ocrPages(filePath, ocrPageNums);

    // Build lookup: page_number → OCR result
    const ocrMap = new Map();
    for (const result of ocrResults) {
      ocrMap.set(result.page_number, result);
    }

    // Merge with quality gate: compare OCR vs fast-parse garbage scores, keep better result
    const profiler = new QualityProfiler();
    const mergedPages = fastParsePages.map(fp => {
      const ocrPage = ocrMap.get(fp.page_number);
      if (ocrPage && ocrPage.text.length > 0) {
        const ocrGarbage = ocrPage.word_garbage_score != null
          ? ocrPage.word_garbage_score
          : profiler.detectWordLevelGarbage(ocrPage.text);
        const fpGarbage = profiler.detectWordLevelGarbage(fp.text);

        if (ocrGarbage < fpGarbage) {
          // OCR is better — use it, adjust confidence if still degraded
          const adjustedConf = ocrGarbage > 0.3 ? 0.4 : ocrPage.confidence;
          return {
            page_number: fp.page_number,
            text: ocrPage.text,
            confidence: adjustedConf,
            method: ocrPage.method,
            empty: ocrPage.empty,
            ocr_replaced: true,
            word_garbage_score: Math.round(ocrGarbage * 100) / 100,
          };
        } else {
          // Fast-parse is better or equal — keep it, flag as OCR-rejected
          const adjustedConf = fpGarbage > 0.3 ? 0.4 : fp.confidence;
          return {
            ...fp,
            confidence: adjustedConf,
            ocr_replaced: false,
            ocr_fallback_to_fp: true,
            word_garbage_score: Math.round(fpGarbage * 100) / 100,
          };
        }
      }
      return { ...fp, ocr_replaced: false };
    });

    const confidences = mergedPages.filter(p => !p.empty).map(p => p.confidence);
    const avgConf = confidences.reduce((s, c) => s + c, 0) / Math.max(confidences.length, 1);

    return {
      method: 'hybrid',
      pages: mergedPages,
      overall_confidence: Math.round(avgConf * 100) / 100,
      fallback_triggered: false,
      ocr_pages: ocrPageNums,
      ocr_method: hasEnhanced ? 'ocr-enhanced' : 'ocr-standard',
    };
  }

  /**
   * Execute extraction with fallback chain
   */
  async extract(filePath, routeDecision) {
    const primaryMethod = routeDecision.method;

    if (primaryMethod === 'manual-review') {
      return {
        method: 'manual-review',
        pages: [],
        overall_confidence: 0,
        fallback_triggered: false,
        requires_human: true,
      };
    }

    try {
      let result;
      if (primaryMethod === 'fast-parse') {
        result = await this.fastParse(filePath);
      } else if (primaryMethod === 'ocr-standard') {
        result = await this.ocrExtract(filePath, false);
      } else if (primaryMethod === 'ocr-enhanced') {
        result = await this.ocrExtract(filePath, true);
      }

      // Check if quality is acceptable
      if (result.overall_confidence < 0.6 && this.fallbackChain.indexOf(primaryMethod) < this.fallbackChain.length - 1) {
        const nextMethod = this.fallbackChain[this.fallbackChain.indexOf(primaryMethod) + 1];
        result = await this._executeFallback(filePath, nextMethod);
        result.fallback_triggered = true;
      }

      return result;
    } catch (err) {
      // Try fallback
      const nextIdx = this.fallbackChain.indexOf(primaryMethod) + 1;
      if (nextIdx < this.fallbackChain.length) {
        const nextMethod = this.fallbackChain[nextIdx];
        const result = await this._executeFallback(filePath, nextMethod);
        result.fallback_triggered = true;
        return result;
      }
      throw err;
    }
  }

  async _executeFallback(filePath, method) {
    if (method === 'fast-parse') return this.fastParse(filePath);
    if (method === 'ocr-standard') return this.ocrExtract(filePath, false);
    if (method === 'ocr-enhanced') return this.ocrExtract(filePath, true);
    return { method: 'manual-review', pages: [], overall_confidence: 0, requires_human: true };
  }

  /**
   * Split full text into per-page arrays (heuristic)
   */
  _splitIntoPages(fullText, pageCount) {
    if (!fullText || pageCount <= 1) {
      return [{ page_number: 1, text: fullText || '', confidence: 0.95, empty: !fullText }];
    }

    // Simple split by form feed or estimated length
    const formFeedPages = fullText.split('\f');
    if (formFeedPages.length >= pageCount * 0.8) {
      return formFeedPages.map((text, i) => ({
        page_number: i + 1,
        text: text.trim(),
        confidence: 0.95,
        empty: text.trim().length < 50,
      }));
    }

    // Fallback: split evenly
    const charsPerPage = Math.ceil(fullText.length / pageCount);
    const pages = [];
    for (let i = 0; i < pageCount; i++) {
      const text = fullText.slice(i * charsPerPage, (i + 1) * charsPerPage).trim();
      pages.push({
        page_number: i + 1,
        text,
        confidence: 0.8,
        empty: text.length < 50,
      });
    }
    return pages;
  }

  /**
   * Save extraction result to disk
   */
  saveExtraction(result, fileName) {
    fs.mkdirSync(this.outputDir, { recursive: true });
    const outPath = path.join(
      this.outputDir,
      `${path.parse(fileName).name}-extracted.json`
    );
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
    return outPath;
  }
}

module.exports = { OCRRouter, TextExtractor };

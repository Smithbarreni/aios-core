/**
 * md-exporter.js — AutoSplit Squad
 *
 * Markdown export with YAML frontmatter metadata and traceability.
 * Generates one MD file per segment with full provenance.
 *
 * Usage:
 *   node md-exporter.js --segments ./output/segments/doc-segments.json \
 *     --extracted ./output/extracted/doc-extracted.json \
 *     --source ./input/processo.pdf
 *
 * Dependencies: none (pure JS)
 */

const fs = require('fs');
const path = require('path');

class MarkdownExporter {
  constructor(options = {}) {
    this.outputDir = options.outputDir || './output/markdown';
    this.pipelineVersion = options.pipelineVersion || '1.0.0';
  }

  /**
   * Generate YAML frontmatter for a segment
   */
  generateFrontmatter(segment, sourcePdf, extractionMeta) {
    const lines = [
      '---',
      `segment_id: "${segment.segment_id}"`,
      `source_pdf: "${path.basename(sourcePdf)}"`,
      `source_pdf_path: "${path.resolve(sourcePdf)}"`,
      `page_range: "${segment.page_start}-${segment.page_end}"`,
      `total_pages: ${segment.page_end - segment.page_start + 1}`,
      `segment_type: "${segment.type}"`,
      `doc_type: "${segment.doc_type}"`,
      `segmentation_confidence: ${segment.confidence}`,
    ];

    if (extractionMeta) {
      lines.push(`extraction_method: "${extractionMeta.method || 'unknown'}"`);
      lines.push(`extraction_confidence: ${extractionMeta.overall_confidence || 0}`);
      if (extractionMeta.fallback_triggered) {
        lines.push(`fallback_triggered: true`);
      }
    }

    lines.push(`generated_at: "${new Date().toISOString()}"`);
    lines.push(`pipeline_version: "${this.pipelineVersion}"`);
    lines.push('---');

    return lines.join('\n');
  }

  /**
   * Generate readable title from doc_type
   */
  generateTitle(docType) {
    const titleMap = {
      'peticao-inicial': 'Peticao Inicial',
      'peticao': 'Peticao',
      'contestacao': 'Contestacao',
      'sentenca': 'Sentenca',
      'acordao': 'Acordao',
      'despacho': 'Despacho',
      'decisao-interlocutoria': 'Decisao Interlocutoria',
      'agravo': 'Agravo',
      'parecer-mp': 'Parecer do Ministerio Publico',
      'laudo-pericial': 'Laudo Pericial',
      'procuracao': 'Procuracao',
      'certidao': 'Certidao',
      'oficio': 'Oficio',
      'attachment': 'Anexo',
      'exhibit': 'Prova Documental',
      'unknown': 'Documento',
      'separator': 'Separador',
    };
    return titleMap[docType] || docType;
  }

  /**
   * Build markdown body from extracted pages
   */
  buildBody(pages, pageStart, pageEnd) {
    const relevantPages = pages.filter(
      p => p.page_number >= pageStart && p.page_number <= pageEnd
    );

    if (relevantPages.length === 0) {
      return '> [Conteudo nao extraido — requer revisao manual]\n';
    }

    const parts = [];
    for (const page of relevantPages) {
      if (page.empty) {
        parts.push(`\n<!-- page: p.${page.page_number} (empty) -->\n`);
        continue;
      }

      if (parts.length > 0) {
        parts.push(`\n---\n<!-- page-break: p.${page.page_number} -->\n`);
      }

      parts.push(page.text);
    }

    return parts.join('\n');
  }

  /**
   * Generate filename for a segment
   * Format: {NNN}-{segment_type}-{doc_type}.md
   */
  generateFilename(segment, index) {
    const num = String(index + 1).padStart(3, '0');
    const type = segment.type || 'piece';
    const docType = segment.doc_type || 'unknown';
    return `${num}-${type}-${docType}.md`;
  }

  /**
   * Export a single segment as Markdown
   */
  exportSegment(segment, index, sourcePdf, extractedData, extractionMeta) {
    const filename = this.generateFilename(segment, index);
    const frontmatter = this.generateFrontmatter(segment, sourcePdf, extractionMeta);
    const title = this.generateTitle(segment.doc_type);
    const body = this.buildBody(
      extractedData.pages || [],
      segment.page_start,
      segment.page_end
    );

    const content = `${frontmatter}\n\n# ${title}\n\n${body}\n`;

    const outPath = path.join(this.outputDir, filename);
    fs.mkdirSync(this.outputDir, { recursive: true });
    fs.writeFileSync(outPath, content, 'utf8');

    return {
      file: filename,
      file_path: outPath,
      segment_id: segment.segment_id,
      doc_type: segment.doc_type,
      pages: `${segment.page_start}-${segment.page_end}`,
      confidence: segment.confidence,
    };
  }

  /**
   * Export all segments and generate index
   */
  exportAll(segments, sourcePdf, extractedData, extractionMeta) {
    const files = [];

    for (let i = 0; i < segments.length; i++) {
      const result = this.exportSegment(
        segments[i], i, sourcePdf, extractedData, extractionMeta
      );
      files.push(result);
    }

    // Generate index file
    const index = {
      source_pdf: path.basename(sourcePdf),
      source_pdf_path: path.resolve(sourcePdf),
      generated_at: new Date().toISOString(),
      pipeline_version: this.pipelineVersion,
      total_pages: (extractedData.pages || []).length,
      total_segments: segments.length,
      files,
    };

    const indexPath = path.join(this.outputDir, 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));

    return { files, indexPath };
  }
}

module.exports = { MarkdownExporter };

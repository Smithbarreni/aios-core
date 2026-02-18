# PRD — AutoSplit MVP Cirúrgico

**Versão:** 1.0
**Data:** 2026-02-16
**Autor:** Morgan (PM) — validado por Mesa Redonda (Aria, Dex, Quinn, Morgan)
**Tipo:** Brownfield Enhancement
**Projeto:** AutoSplit Squad (`~/.aios-core/.aios-core/squads/autosplit/`)

---

## 1. Problema

O AutoSplit squad processa PDFs jurídicos em 9 stages com 4 agentes Claude Code. Os 6 scripts são **100% heurísticos** (regex, SHA-256, pattern matching — zero chamadas de API LLM), mas Claude é o runtime que orquestra tudo: lê task definitions, intermediate JSON outputs, amostras de texto, e MD files para QC.

**Custo:** ~54K tokens por PDF de 100 páginas.
**Causa raiz:** Não existe um `main()` que encadeie os 6 scripts. Claude é a cola entre stages.

---

## 2. Solução

Criar `autosplit-pipeline.js` — um orchestrator standalone que chama os 6 scripts existentes via `require()`, roda end-to-end via `node`, e produz um relatório resumido.

**Princípio:** Zero modificação nos scripts existentes. Zero risco de regressão. Se falhar, `rm autosplit-pipeline.js` e voltamos ao v1.0.

---

## 3. Métricas de Sucesso

| Métrica | Antes (v1.0) | Depois (MVP) | Critério |
|---------|-------------|-------------|----------|
| Tokens por PDF 100p | ~54.000 | 0 (execução) + ~3K (review opcional) | **-94% mínimo** |
| Tempo de processamento | Depende de turns Claude | Determinístico (node) | **Sem variação** |
| Scripts existentes modificados | — | 0 | **Zero changes** |
| Rollback | — | `rm autosplit-pipeline.js` | **Instantâneo** |

---

## 4. Escopo — O Que Entra

### 4.1. `autosplit-pipeline.js` (arquivo único, ~300-400 linhas)

**Localização:** `squads/autosplit/scripts/autosplit-pipeline.js`

**Interface CLI:**
```bash
# Uso básico
node autosplit-pipeline.js --source ./input/processo.pdf --output ./output/

# Com resume de checkpoint
node autosplit-pipeline.js --source ./input/processo.pdf --output ./output/ --resume

# Verbose mode
node autosplit-pipeline.js --source ./input/processo.pdf --output ./output/ --verbose

# Diretório de input (batch)
node autosplit-pipeline.js --source ./input/ --output ./output/
```

**Pipeline Stages (6 stages, mapeamento 1:1 com scripts existentes):**

```
Stage 1: INGEST    → PDFIngester.ingest(sourcePath)
Stage 2: PROFILE   → QualityProfiler.profileDocument() + DocumentClassifier.classify()
Stage 3: ROUTE     → OCRRouter.route(profile)
Stage 4: EXTRACT   → TextExtractor.extract(filePath, routeDecision)
Stage 5: SEGMENT   → PageSegmenter.segment(extractedData)
Stage 6: EXPORT+QC → MarkdownExporter.exportAll() + QCValidator.runQualityGate()
```

**Detalhamento das chamadas por stage:**

#### Stage 1: INGEST
```javascript
const { PDFIngester } = require('./pdf-ingester.js');
const ingester = new PDFIngester({ outputDir: path.join(outputDir, 'intake') });
const { manifest } = await ingester.ingest(sourcePath);
// Output: manifest com files[], duplicates[], errors[]
```

#### Stage 2: PROFILE
```javascript
const { QualityProfiler, DocumentClassifier } = require('./quality-profiler.js');
const profiler = new QualityProfiler({ outputDir: path.join(outputDir, 'profiles') });
const classifier = new DocumentClassifier();

for (const file of manifest.files) {
  // Precisa do texto extraído para profile — usa fast-parse provisório
  const profile = await profiler.profileDocument(file.source_path, extractedText, pageCount);
  const classification = classifier.classify(extractedText);
  profiler.saveProfile({ ...profile, classification });
}
```

#### Stage 3: ROUTE
```javascript
const { OCRRouter } = require('./ocr-router.js');
const router = new OCRRouter({ outputDir: path.join(outputDir, 'routes') });
const routeDecision = router.route(profile);
router.saveRoute(routeDecision);
```

#### Stage 4: EXTRACT
```javascript
const { TextExtractor } = require('./ocr-router.js');
const extractor = new TextExtractor({ outputDir: path.join(outputDir, 'extracted') });
const extractedData = await extractor.extract(file.source_path, routeDecision);
extractor.saveExtraction(extractedData, file.name);
```

#### Stage 5: SEGMENT
```javascript
const { PageSegmenter } = require('./page-segmenter.js');
const segmenter = new PageSegmenter({ outputDir: path.join(outputDir, 'segments') });
const segments = segmenter.segment(extractedData);
segmenter.saveSegments(segments, file.name);
```

#### Stage 6: EXPORT + QC
```javascript
const { MarkdownExporter } = require('./md-exporter.js');
const { QCValidator } = require('./qc-validator.js');

const exporter = new MarkdownExporter({ outputDir: path.join(outputDir, 'markdown') });
const { files, indexPath } = exporter.exportAll(segments, file.source_path, extractedData, extractedData);

const validator = new QCValidator({ reviewDir: path.join(outputDir, 'review') });
const qcResult = validator.runQualityGate(path.join(outputDir, 'markdown'), indexPath);
```

### 4.2. Checkpointing

**Arquivo:** `.checkpoint.json` no diretório de output.

**Estrutura:**
```json
{
  "pipeline_version": "1.0.0",
  "source": "/path/to/input.pdf",
  "started_at": "2026-02-16T04:00:00Z",
  "current_stage": 4,
  "completed_stages": [1, 2, 3],
  "stage_results": {
    "1": { "status": "completed", "duration_ms": 230, "output_path": "intake/manifest-2026-02-16.json" },
    "2": { "status": "completed", "duration_ms": 1500, "output_path": "profiles/" },
    "3": { "status": "completed", "duration_ms": 50, "output_path": "routes/" }
  },
  "checksum": "sha256-of-this-json-without-checksum-field"
}
```

**Comportamento:**
- Escrita atômica: escreve em `.checkpoint.tmp`, depois `rename()` para `.checkpoint.json`
- No `--resume`: valida checksum, retoma do `current_stage`
- Se checksum inválido: descarta checkpoint, recomeça do zero com warning

**Referência:** Recomendação R4 da pesquisa (checkpoint com validação de integridade)

### 4.3. Signal Handlers (Graceful Shutdown)

```javascript
let isShuttingDown = false;
process.on('SIGINT', () => { isShuttingDown = true; });
process.on('SIGTERM', () => { isShuttingDown = true; });
// Antes de cada stage: if (isShuttingDown) { saveCheckpoint(); process.exit(0); }
```

**Referência:** Recomendação R5 da pesquisa

### 4.4. `pipeline-report.json`

**Gerado ao final do pipeline. É o que `@pipeline-chief *review` vai ler (~3K tokens vs 54K).**

```json
{
  "pipeline_version": "1.0.0",
  "source": "processo.pdf",
  "completed_at": "2026-02-16T04:05:00Z",
  "duration_ms": 12500,
  "stages": {
    "ingest": { "files": 1, "duplicates": 0, "errors": 0 },
    "profile": { "quality_tier": "B", "readability": 72, "noise": "low" },
    "route": { "method": "fast-parse", "engine": "pdf-parse" },
    "extract": { "pages": 142, "confidence": 0.95, "fallback": false },
    "segment": { "total_segments": 23, "types": { "peticao": 3, "sentenca": 1, "despacho": 8, "unknown": 11 } },
    "export": { "files_generated": 23, "index_path": "markdown/index.json" },
    "qc": { "passed": 19, "flagged": 3, "rejected": 1, "mislabels": 0 }
  },
  "output_dir": "./output/",
  "review_needed": true,
  "review_reasons": ["3 files flagged", "1 file rejected"]
}
```

---

## 5. Escopo — O Que NÃO Entra

| Item Excluído | Razão | Quando Entra |
|---------------|-------|-------------|
| `pdftotext-wrapper.js` (node-poppler) | Requer substituição do extrator | Fase 2 |
| `text-cleaner.js` (7 stages) | Módulo novo, não é cola | Fase 2 |
| `quality-scorer.js` (5 dimensões) | Módulo novo, não é cola | Fase 2 |
| `legal-patterns.js` (centralizado) | Módulo novo, não é cola | Fase 2 |
| Ollama / LLM local | Projeto inteiro dentro do projeto | Fase 3 |
| Modificação nos 6 scripts | Zero risco de regressão | Fase 2+ |
| Testes automatizados dos scripts | Quinn exige, mas não bloqueia MVP | Fase 1.5 |
| INDEX.md automático | Hoje criado manualmente pós-extração | Fase 1.5 |

---

## 6. Arquitetura

```
┌─────────────────────────────────────────────────┐
│              autosplit-pipeline.js               │
│  (orchestrator — arquivo único, zero deps novas) │
├─────────────────────────────────────────────────┤
│                                                  │
│  CLI Parser (process.argv)                       │
│       ↓                                          │
│  Checkpoint Loader (--resume)                    │
│       ↓                                          │
│  ┌─────────────────────────────────────────┐    │
│  │  Stage Loop (1→6)                        │    │
│  │                                          │    │
│  │  for each stage:                         │    │
│  │    1. Check graceful shutdown flag        │    │
│  │    2. Skip if already completed (resume) │    │
│  │    3. Execute stage via require()        │    │
│  │    4. Save checkpoint (atomic write)     │    │
│  │    5. Log progress (if --verbose)        │    │
│  └─────────────────────────────────────────┘    │
│       ↓                                          │
│  Report Generator → pipeline-report.json         │
│                                                  │
└──────────────┬──────────────────────────────────┘
               │ require()
    ┌──────────┼──────────────────────────────┐
    │          │          │         │          │
    ▼          ▼          ▼         ▼          ▼
pdf-ingester  quality-   ocr-     page-      md-exporter
  .js         profiler   router   segmenter    .js
              .js        .js      .js          ▼
                                             qc-validator
                                               .js
```

**Dependências:** Zero novas. Apenas `require()` dos 6 scripts existentes + `fs`, `path`, `crypto` (built-in Node.js).

---

## 7. Acceptance Criteria

### AC1: Pipeline roda end-to-end sem Claude
```
DADO que tenho um PDF jurídico em ./input/
QUANDO executo `node autosplit-pipeline.js --source ./input/doc.pdf --output ./output/`
ENTÃO o pipeline completa os 6 stages sem intervenção humana
E gera arquivos .md em ./output/markdown/
E gera pipeline-report.json em ./output/
E gera .checkpoint.json em ./output/
E o exit code é 0
```

### AC2: Output é equivalente ao v1.0
```
DADO que processei o mesmo PDF no v1.0 (via Claude) e no MVP (via node)
QUANDO comparo os arquivos .md gerados
ENTÃO os segmentos identificados são os mesmos (±1 segmento de tolerância)
E o conteúdo textual é idêntico
E os frontmatters têm os mesmos campos
```

### AC3: Checkpoint e resume funcionam
```
DADO que o pipeline foi interrompido no Stage 4 (Ctrl+C)
QUANDO executo com --resume
ENTÃO o pipeline retoma do Stage 4
E .checkpoint.json contém stages 1-3 como completed
E o resultado final é idêntico a uma execução sem interrupção
```

### AC4: Checkpoint corrupto é descartado
```
DADO que .checkpoint.json existe mas com checksum inválido
QUANDO executo com --resume
ENTÃO o pipeline exibe warning "Checkpoint corrupto, recomeçando do zero"
E executa do Stage 1
```

### AC5: Graceful shutdown preserva progresso
```
DADO que o pipeline está executando o Stage 3
QUANDO envio SIGINT (Ctrl+C)
ENTÃO o pipeline salva checkpoint com current_stage=3 e completed_stages=[1,2]
E exit code é 0
E posso retomar com --resume
```

### AC6: pipeline-report.json é completo e legível
```
DADO que o pipeline completou com sucesso
QUANDO leio pipeline-report.json
ENTÃO contém todas as seções (ingest, profile, route, extract, segment, export, qc)
E review_needed indica se há flagged/rejected files
E duration_ms reflete o tempo real de execução
E o tamanho do arquivo é <5KB (target ~3K tokens para review)
```

### AC7: Zero dependências novas
```
DADO o package.json (ou squad.yaml) do AutoSplit
QUANDO listo as dependências do MVP
ENTÃO nenhuma dependência nova foi adicionada
E autosplit-pipeline.js usa apenas require() dos scripts existentes + módulos Node.js built-in
```

---

## 8. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Stage 2 precisa de texto extraído para profile, mas extração é Stage 4 | Alta | Bloqueia design | Fazer fast-parse provisório no Stage 2 (PDFIngester já carrega buffer). Alternativa: reordenar stages |
| `pdf-parse` falha em PDFs complexos | Média | Degradação | Manter fallback chain do OCRRouter como está. Fase 2 troca para node-poppler |
| Checkpoint race condition em crash súbito | Baixa | Perda de progresso | Escrita atômica (.tmp → rename). SIGINT handler. Validação de checksum |
| Scripts usam `process.cwd()` internamente | Baixa | Paths errados | Todos os scripts recebem paths absolutos via options. Verificar com grep |

### Risco Arquitetural: Ordem dos Stages

O `QualityProfiler.profileDocument()` recebe `extractedText` como parâmetro, mas a extração completa é Stage 4. Duas opções:

**Opção A (recomendada):** Fast-parse provisório no Stage 2 — usar `pdf-parse` para extrair texto bruto apenas para profiling. A extração "real" acontece no Stage 4 com a rota definida pelo OCRRouter.

**Opção B:** Reordenar — INGEST → EXTRACT → PROFILE → ROUTE → (re-extract se necessário) → SEGMENT → EXPORT → QC. Muda a lógica mas evita dupla extração.

**Decisão:** Opção A. Mantém a ordem dos stages idêntica ao v1.0, minimiza surpresas.

---

## 9. Definição de Pronto (DoD)

- [ ] `autosplit-pipeline.js` criado e funcional
- [ ] Todos os 7 ACs passam
- [ ] Testado em pelo menos 1 PDF real (caso Starostik ou Suzano)
- [ ] `pipeline-report.json` gerado com todas as seções
- [ ] Checkpointing funciona (interrupção + resume)
- [ ] Graceful shutdown funciona (SIGINT)
- [ ] Zero scripts existentes modificados
- [ ] Zero dependências novas adicionadas
- [ ] Code review por Quinn (QA)

---

## 10. Fases Seguintes (Roadmap)

| Fase | Escopo | Dependência |
|------|--------|-------------|
| **MVP (esta)** | Orchestrator + checkpoint + report | Nenhuma |
| **1.5** | Testes automatizados + INDEX.md automático | MVP funcionando |
| **2** | node-poppler + text-cleaner + quality-scorer + legal-patterns | MVP validado em produção |
| **3** | Ollama + benchmark + agent layer updates | Fase 2 estável |

---

## 11. Estimativa

| Item | Esforço |
|------|---------|
| CLI parser + stage loop + require wiring | 1h |
| Checkpointing (atomic write + resume + validation) | 1h |
| Signal handlers (graceful shutdown) | 15min |
| Report generator (pipeline-report.json) | 30min |
| Risco Stage 2 (fast-parse provisório) | 30min |
| Teste end-to-end em PDF real | 30min |
| **Total** | **~3-4h (1 sessão Claude Code)** |

---

*— Morgan, planejando o futuro 📊*

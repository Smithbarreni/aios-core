---
task: Quality Gate
responsavel: "@pipeline-chief"
responsavel_type: agent
atomic_layer: task
Entrada: |
  - output_dir: Diretorio com MDs exportados (obrigatorio)
  - index_path: Caminho do indice JSON (obrigatorio)
Saida: |
  - report:
    - total_files: Total de arquivos verificados
    - passed: Arquivos que passaram no QC
    - flagged: Arquivos com problemas menores (warnings)
    - rejected: Arquivos que precisam de revisao humana
    - mislabels_caught: Classificacoes incorretas detectadas
Checklist:
  - "[ ] Carregar indice e todos os MDs"
  - "[ ] Verificar metadata completeness em cada MD"
  - "[ ] Cross-check: tipo no metadata vs conteudo do texto"
  - "[ ] Detectar mislabels grosseiros (ex: 'sentenca' sem 'julgo')"
  - "[ ] Verificar que page ranges nao se sobrepoe e cobrem todo o PDF"
  - "[ ] Verificar extraction confidence aceitavel"
  - "[ ] Gerar relatorio de qualidade"
  - "[ ] Mover rejeitados para fila de revisao humana"
---

# *quality-gate

Valida todos os outputs do pipeline, detecta mislabels, e roteia edge cases para revisao humana.

## Uso

```
@pipeline-chief *quality-gate ./output/markdown/ --index ./output/markdown/index.json
```

## Quality Checks

| Check | Severity | Threshold |
|-------|----------|-----------|
| Missing metadata fields | REJECT | Any required field missing |
| Classification mislabel | REJECT | Cross-check fails |
| Low extraction confidence | FLAG | < 0.6 per-page average |
| Page range overlap | REJECT | Any overlap detected |
| Page range gaps | FLAG | Missing pages |
| Empty segment content | REJECT | < 50 chars in body |
| Duplicate segment | FLAG | >90% text similarity |

## Mislabel Detection Rules

```
IF doc_type == "sentenca" AND text NOT CONTAINS ["julg", "procedente", "improcedente"]
  → MISLABEL suspected

IF doc_type == "peticao-inicial" AND text NOT CONTAINS ["excelentissimo", "requer"]
  → MISLABEL suspected

IF doc_type == "acordao" AND text NOT CONTAINS ["acordam", "desembargador"]
  → MISLABEL suspected

IF doc_type == "procuracao" AND text NOT CONTAINS ["poder", "substabelecer", "outorga"]
  → MISLABEL suspected
```

## Output Report

```
🏭 Quality Gate Report

Total files: 12
✅ Passed: 9
⚠️ Flagged: 2 (warnings, auto-approved)
❌ Rejected: 1 (sent to human review)

Mislabels caught: 1
  - 005-piece-sentenca.md → likely "despacho" (no "julgo" found)

Human review queue: ./output/review/
```

## Script

Uses: `scripts/qc-validator.js`

---
task: Profile Document Quality
responsavel: "@doc-profiler"
responsavel_type: agent
atomic_layer: task
Entrada: |
  - file_path: Caminho do PDF (obrigatorio)
  - manifest_path: Ou manifest para batch profiling
Saida: |
  - profile: Quality profile completo por arquivo
    - dpi_estimate: DPI estimado do scan
    - orientation: normal | rotated-90 | rotated-180 | upside-down
    - page_count: Total de paginas
    - has_text_layer: boolean (PDF nativo vs scan)
    - readability_score: 0-100 (qualidade legivel)
    - noise_level: low | medium | high
    - skew_detected: boolean
Checklist:
  - "[ ] Abrir PDF e extrair metadados basicos"
  - "[ ] Detectar se tem text layer nativo"
  - "[ ] Estimar DPI do scan (se aplicavel)"
  - "[ ] Detectar orientacao (normal, rotacionado, invertido)"
  - "[ ] Calcular readability score"
  - "[ ] Detectar nivel de ruido e skew"
  - "[ ] Gerar quality profile JSON"
---

# *profile

Avalia qualidade fisica de cada documento: DPI, orientacao, ruido, readability.

## Uso

```
@doc-profiler *profile ./input/documento.pdf
@doc-profiler *profile --manifest ./output/intake/manifest.json
```

## Quality Tiers

| Tier | Readability | Extraction Path |
|------|-------------|-----------------|
| A (Excellent) | 80-100 | Fast parse (text layer) |
| B (Good) | 60-79 | Fast parse or light OCR |
| C (Degraded) | 40-59 | Full OCR with preprocessing |
| D (Poor) | 20-39 | Enhanced OCR + manual review flag |
| F (Unusable) | 0-19 | Manual review required |

## Script

Uses: `scripts/quality-profiler.js`

---
task: Route Extraction Path
responsavel: "@extractor"
responsavel_type: agent
atomic_layer: task
Entrada: |
  - file_path: Caminho do PDF (obrigatorio)
  - profile: Quality profile do documento (obrigatorio)
Saida: |
  - route:
    - method: fast-parse | ocr-standard | ocr-enhanced | manual-review
    - preprocessing: Lista de pre-processamentos necessarios
    - engine: Motor de extracao selecionado
    - rationale: Justificativa da decisao
Checklist:
  - "[ ] Ler quality profile do documento"
  - "[ ] Avaliar has_text_layer → fast-parse candidato"
  - "[ ] Se scan: avaliar DPI e readability para decidir OCR tier"
  - "[ ] Definir preprocessing necessario (deskew, denoise, rotate)"
  - "[ ] Selecionar engine e metodo"
  - "[ ] Registrar rationale da decisao de roteamento"
---

# *route

Analisa o quality profile e decide qual caminho de extracao cada documento deve seguir.

## Uso

```
@extractor *route ./input/documento.pdf --profile ./output/profiles/doc-profile.json
```

## Routing Decision Matrix

| Condition | Method | Preprocessing |
|-----------|--------|---------------|
| has_text_layer=true, readability≥80 | fast-parse | none |
| has_text_layer=true, readability<80 | fast-parse + OCR verify | none |
| scan, DPI≥200, readability≥60 | ocr-standard | deskew if needed |
| scan, DPI≥150, readability≥40 | ocr-enhanced | deskew + denoise |
| scan, DPI<150 or readability<40 | ocr-enhanced | full preprocessing |
| orientation!=normal | any + rotate | auto-rotate first |
| readability<20 | manual-review | flag for human |

## Script

Uses: `scripts/ocr-router.js`

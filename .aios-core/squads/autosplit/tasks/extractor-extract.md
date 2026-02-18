---
task: Extract Text
responsavel: "@extractor"
responsavel_type: agent
atomic_layer: task
Entrada: |
  - file_path: Caminho do PDF (obrigatorio)
  - route: Decisao de roteamento (method, preprocessing, engine)
Saida: |
  - extracted_text: Texto extraido por pagina
  - per_page_confidence: Score de confianca por pagina
  - method_used: Metodo efetivamente utilizado
  - fallback_triggered: boolean (se fallback foi necessario)
Checklist:
  - "[ ] Aplicar preprocessing definido no route (rotate, deskew, denoise)"
  - "[ ] Executar extracao pelo metodo primario"
  - "[ ] Calcular confianca por pagina"
  - "[ ] Se confianca media < 0.6, acionar fallback"
  - "[ ] Fallback: tentar metodo alternativo (OCR se era fast-parse, enhanced se era standard)"
  - "[ ] Marcar paginas vazias ou near-empty"
  - "[ ] Gerar output estruturado por pagina"
---

# *extract

Executa extracao de texto do PDF usando o metodo definido pelo routing, com fallback automatico.

## Uso

```
@extractor *extract ./input/documento.pdf --route ./output/routes/doc-route.json
```

## Extraction Methods

### fast-parse
- Extrai text layer nativo do PDF
- Rapido, alta fidelidade para PDFs digitais
- Sem dependencias externas pesadas

### ocr-standard
- OCR com engine padrao (tesseract)
- Adequado para scans de boa qualidade
- Preprocessing: deskew basico

### ocr-enhanced
- OCR com preprocessing agressivo
- Denoise, deskew, contrast enhancement, binarization
- Para scans degradados

### Fallback Chain
```
fast-parse → ocr-standard → ocr-enhanced → manual-review
```

## Output Format

```json
{
  "file": "documento.pdf",
  "pages": [
    {
      "page_number": 1,
      "text": "...",
      "confidence": 0.92,
      "method": "fast-parse",
      "empty": false
    }
  ],
  "overall_confidence": 0.89,
  "fallback_triggered": false
}
```

## Script

Uses: `scripts/ocr-router.js` (extract module)

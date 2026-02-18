---
task: Segment Into Pieces
responsavel: "@splitter"
responsavel_type: agent
atomic_layer: task
Entrada: |
  - extracted_path: Caminho do JSON com texto extraido por pagina (obrigatorio)
  - classification: Classificacao do documento (opcional, melhora segmentacao)
Saida: |
  - segments: Lista de segmentos identificados
    - segment_id: ID unico do segmento
    - type: Tipo do segmento (piece/attachment/exhibit)
    - doc_type: Tipo documental (peticao, sentenca, etc.)
    - page_start: Pagina inicial (inclusive)
    - page_end: Pagina final (inclusive)
    - confidence: Score de confianca da segmentacao
    - boundary_markers: Indicadores usados para definir limites
Checklist:
  - "[ ] Carregar texto extraido por pagina"
  - "[ ] Identificar marcadores de inicio de peca (cabecalhos, selos, numeracao)"
  - "[ ] Identificar marcadores de inicio de anexo/exhibit"
  - "[ ] Definir limites de cada segmento respeitando fronteiras de pagina"
  - "[ ] Classificar cada segmento (tipo documental)"
  - "[ ] Atribuir confidence score a cada segmentacao"
  - "[ ] Validar que nenhuma pagina ficou orfao (sem segmento)"
---

# *segment

Identifica onde uma peca processual termina e outra comeca, segmentando no nivel de pagina.

## Uso

```
@splitter *segment ./output/extracted/documento-extracted.json
@splitter *segment --batch ./output/extracted/
```

## Boundary Detection Heuristics

| Marker | Weight | Description |
|--------|--------|-------------|
| Court header/seal | 0.9 | "PODER JUDICIARIO", brasao, cabecalho do tribunal |
| Process number restart | 0.8 | Novo numero de processo no topo da pagina |
| "EXCELENTISSIMO" | 0.85 | Inicio tipico de peticao |
| "CERTIDAO" header | 0.8 | Inicio de certidao |
| "SENTENCA" / "ACORDAO" | 0.9 | Inicio de decisao |
| Page number reset | 0.6 | Numeracao recomeça do 1 |
| Blank separator page | 0.7 | Pagina em branco entre pecas |
| "ANEXO" / "DOC." label | 0.75 | Inicio de anexo |
| Drastic format change | 0.5 | Mudanca brusca de layout/fonte |

## Segment Types

| Type | Description |
|------|-------------|
| `piece` | Peca processual principal (peticao, sentenca, etc.) |
| `attachment` | Anexo/documento juntado |
| `exhibit` | Prova documental (fotos, contratos, etc.) |
| `cover` | Folha de rosto / capa |
| `separator` | Pagina separadora (descartavel) |

## Script

Uses: `scripts/page-segmenter.js`

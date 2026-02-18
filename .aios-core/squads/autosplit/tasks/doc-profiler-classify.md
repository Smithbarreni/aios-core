---
task: Classify Document Type
responsavel: "@doc-profiler"
responsavel_type: agent
atomic_layer: task
Entrada: |
  - file_path: Caminho do PDF (obrigatorio)
  - profile: Quality profile do documento (opcional, sera gerado se ausente)
  - text_sample: Primeiras N paginas de texto extraido (para classificacao)
Saida: |
  - classification:
    - primary_type: Tipo principal do documento
    - confidence: 0.0-1.0
    - secondary_type: Tipo secundario (se ambiguo)
    - indicators: Lista de indicadores que suportam a classificacao
Checklist:
  - "[ ] Extrair texto das primeiras 3 paginas (ou menos se documento curto)"
  - "[ ] Identificar marcadores estruturais (cabecalhos, numeracao, selos)"
  - "[ ] Classificar tipo primario com score de confianca"
  - "[ ] Se confianca < 0.7, sugerir tipo secundario"
  - "[ ] Se confianca < 0.5, marcar para revisao humana"
  - "[ ] Registrar indicadores que suportam a classificacao"
---

# *classify

Determina o tipo de documento judicial/legal com score de confianca.

## Uso

```
@doc-profiler *classify ./input/documento.pdf
@doc-profiler *classify --manifest ./output/intake/manifest.json
```

## Document Types (Legal/Brazilian Courts)

| Type | Description | Key Indicators |
|------|-------------|----------------|
| `peticao-inicial` | Peticao Inicial | "Excelentissimo", qualificacao das partes |
| `contestacao` | Contestacao | "contesta a presente acao", preliminares |
| `sentenca` | Sentenca | "Julgo", "procedente/improcedente" |
| `acordao` | Acordao | "Acordam os Desembargadores", ementa |
| `despacho` | Despacho | "Cite-se", "Intime-se", curto |
| `decisao-interlocutoria` | Decisao Interlocutoria | "Defiro/Indefiro", tutela |
| `recurso` | Recurso (generico) | "recorre", "reforma" |
| `agravo` | Agravo de Instrumento | "agravo", efeito suspensivo |
| `parecer-mp` | Parecer Ministerio Publico | "Ministerio Publico opina" |
| `laudo-pericial` | Laudo Pericial | "perito", "quesitos" |
| `procuracao` | Procuracao | "poderes", "substabelecer" |
| `certidao` | Certidao | "Certifico e dou fe" |
| `oficio` | Oficio | "Oficio n.", "Cumprimentos" |
| `attachment` | Anexo generico | Detectado por posicao/contexto |
| `unknown` | Nao classificado | Confianca < 0.3 |

## Confidence Thresholds

| Range | Action |
|-------|--------|
| 0.8-1.0 | Auto-accept classification |
| 0.5-0.79 | Accept with secondary suggestion |
| 0.3-0.49 | Flag for human review |
| 0.0-0.29 | Mark as `unknown`, require human review |

## Script

Uses: `scripts/quality-profiler.js` (classify module)

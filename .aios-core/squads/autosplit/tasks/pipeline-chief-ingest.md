---
task: Ingest Files
responsavel: "@pipeline-chief"
responsavel_type: agent
atomic_layer: task
Entrada: |
  - source_path: Caminho do diretorio ou arquivo PDF (obrigatorio)
  - recursive: Buscar PDFs recursivamente (default: true)
  - dedup: Rejeitar duplicatas por hash (default: true)
Saida: |
  - manifest: Lista de arquivos registrados com hash, tamanho, page count
  - duplicates: Lista de arquivos rejeitados por duplicata
  - errors: Lista de arquivos que falharam no intake
Checklist:
  - "[ ] Validar que source_path existe e contem PDFs"
  - "[ ] Calcular SHA-256 para cada arquivo"
  - "[ ] Verificar duplicatas contra registro existente"
  - "[ ] Registrar metadados: nome, hash, tamanho, timestamp, source_path"
  - "[ ] Contar paginas de cada PDF"
  - "[ ] Gerar manifest de intake"
  - "[ ] Log de erros para arquivos nao-processaveis"
---

# *ingest

Recebe PDFs de entrada, registra no pipeline com hash e metadados, rejeita duplicatas.

## Uso

```
@pipeline-chief *ingest ./input/caso-123/
@pipeline-chief *ingest ./input/documento.pdf
@pipeline-chief *ingest ./input/ --no-dedup
```

## Parametros

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `source_path` | string | - | Diretorio ou arquivo PDF (required) |
| `--recursive` | flag | true | Buscar PDFs em subdiretorios |
| `--no-dedup` | flag | false | Aceitar duplicatas |
| `--output-dir` | string | ./output/intake/ | Diretorio de saida do manifest |

## Flow

```
1. Scan source_path
   ├── Se diretorio → listar todos *.pdf (recursivo se flag)
   └── Se arquivo → validar que e PDF

2. Para cada PDF:
   ├── Calcular SHA-256
   ├── Verificar duplicata no registro
   │   ├── Se duplicata e dedup=true → registrar em duplicates[]
   │   └── Se novo → continuar
   ├── Extrair metadados basicos (tamanho, page count)
   └── Registrar no manifest

3. Gerar manifest JSON
   ├── files[]: {name, hash, size, pages, source_path, timestamp}
   ├── duplicates[]: {name, hash, original_path}
   └── errors[]: {name, error_message}

4. Exibir resumo
```

## Output

```
📥 Intake Complete

Files registered: 12
Duplicates skipped: 2
Errors: 1

Manifest: ./output/intake/manifest-2026-02-13.json
```

## Script

Uses: `scripts/pdf-ingester.js`

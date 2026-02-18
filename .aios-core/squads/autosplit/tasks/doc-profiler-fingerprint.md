---
task: Fingerprint Files
responsavel: "@doc-profiler"
responsavel_type: agent
atomic_layer: task
Entrada: |
  - manifest_path: Caminho do manifest de intake (obrigatorio)
  - files: Lista de arquivos para fingerprinting (alternativa ao manifest)
Saida: |
  - fingerprints: Mapa hash → metadados expandidos
  - duplicates_found: Duplicatas cruzadas detectadas
Checklist:
  - "[ ] Ler manifest de intake"
  - "[ ] Calcular SHA-256 de cada arquivo (se nao calculado)"
  - "[ ] Calcular hash parcial (primeiros 4KB) para fast-dedup"
  - "[ ] Cruzar hashes contra banco de fingerprints existente"
  - "[ ] Registrar fingerprint com provenance completa"
  - "[ ] Sinalizar duplicatas cruzadas entre batches"
---

# *fingerprint

Gera fingerprints (SHA-256 + hash parcial) para cada arquivo, detecta duplicatas cruzadas entre batches.

## Uso

```
@doc-profiler *fingerprint ./output/intake/manifest-2026-02-13.json
```

## Flow

```
1. Ler manifest de intake
2. Para cada arquivo:
   ├── SHA-256 completo (se nao presente)
   ├── Hash parcial (primeiros 4KB) para fast-match
   ├── Cruzar contra fingerprint DB
   │   ├── Match exato → marcar como duplicata cruzada
   │   └── Sem match → registrar novo fingerprint
   └── Gravar provenance: {hash, partial_hash, first_seen, source_batch}
3. Atualizar fingerprint DB
4. Gerar relatorio
```

## Script

Uses: `scripts/pdf-ingester.js` (fingerprint module)

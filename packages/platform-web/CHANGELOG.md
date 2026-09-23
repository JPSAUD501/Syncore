# @syncore/platform-web

## 0.1.2

### Patch Changes

- 6b781ec: Browser runtimes using OPFS persistence no longer fail to start after a page reload interrupts a file write. An empty `.meta.json` left by the interrupted write made every later boot throw `Unexpected end of JSON input`; the metadata is now treated as missing and the file is still readable.
- Updated dependencies [76f48b7]
- Updated dependencies [a9b4335]
- Updated dependencies [13f9d80]
  - @syncore/core@0.3.0
  - @syncore/schema@0.3.0

## 0.1.1

### Patch Changes

- Updated dependencies [47b6b6e]
  - @syncore/schema@0.2.0
  - @syncore/core@0.2.0

---
"@syncore/platform-web": patch
"syncorejs": patch
---

Browser runtimes using OPFS persistence no longer fail to start after a page reload interrupts a file write. An empty `.meta.json` left by the interrupted write made every later boot throw `Unexpected end of JSON input`; the metadata is now treated as missing and the file is still readable.

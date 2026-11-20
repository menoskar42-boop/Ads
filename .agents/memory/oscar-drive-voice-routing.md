---
name: Oscar Drive voice routing
description: Separate speech recognition from intent classification and keep common ASR corrections local.
---

For Oscar Drive, the speech recognizer produces text; Groq only classifies that text. Prefer deterministic local corrections for recurring Egyptian Arabic/English recognition errors before calling Groq. Keep matching high-confidence aliases in both the web parser and Android voice catalog, and require clear command context for ambiguous aliases.

**Why:** the user wants to reduce Groq usage as much as possible; the reported failures were transcription variations, not a need for a general language model.

**How to apply:** when adding voice support, check the browser and Android recognition paths separately, add local rules first, and reserve Groq for utterances those rules cannot safely resolve.

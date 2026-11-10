# Security

If you find a security problem in the collector or the receiver, please open a
GitHub issue without including any secret, transcript content, or personal data
in the report.

Things to know before reporting:

- The masker (`client/mask-export.py`) is deterministic pattern matching. It is
  documented as best-effort: it can miss secrets and does not anonymize personal
  information or code. A miss it should have caught is a valid report.
- Originals never leave your machine by design: only the masked derived copy is
  packed and uploaded. A code path that uploads unmasked content outside the
  explicit low-level `--allow-unmasked` testing override is a serious bug;
  please report it.
- The receiver stores uploads in a private Hugging Face dataset operated by the
  project owner. Do not email transcripts or secrets to anyone.

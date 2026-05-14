# Token Economy Notes

- Keep SQLite as the first retrieval layer.
- Do not send full JSON files to the model.
- Limit chat history with `MAX_HISTORY_MESSAGES`.
- Limit retrieved context with `MAX_CONTEXT_RESULTS` and `MAX_CONTEXT_CHARS`.
- Use FTS search for broad lore questions, then answer from the top snippets.
- Prefer exact tools for operators, enemies, items, stages, and images.
- Add embedding RAG later only if FTS misses too many lore questions.

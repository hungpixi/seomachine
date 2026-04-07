# Antigravity AI Agent Integration

This workspace provides native support for **Antigravity** and compatible ComarAI multi-agent architectures, structured similarly to its Claude Code implementation.

## 🤖 For AI Agents (Antigravity)
If you are operating as an Antigravity AI Agent (or similar), this document serves as your central operational playbook.

### Workflows & Skills
The workflow commands originally designed for this SEO Machine have been mapped to standard formats within the `.agent/workflows/` directory.

Any time the user requests an action like "Research topics" or "Write an article", you should prioritize reading the corresponding workflow file (e.g., `.agent/workflows/research.md`) to understand the strict process that must be followed.

### The Execution Process
1. **Analyze Context First**: Before drafting new content, you MUST review the constraints located in the `context/` folder (specifically `brand-voice.md`, `seo-guidelines.md`, etc.).
2. **Execute Python Analysts**: Use `run_command` tools to trigger the python scripts located in the root or `data_sources/modules/` to gain analytical insights. Assume the user can install requirements via `pip install -r data_sources/requirements.txt` if they encounter module errors.
3. **Draft in Designated Folders**: Output your final research briefs to `research/` and written drafts to `drafts/` following the naming conventions outlined in the workflow files.

## Python Scripts
The analysis modules have standard CLI endpoints:
- `python research_serp_analysis.py` 
- `python seo_quality_rater.py`
*(Check `README.md` for full command reference)*

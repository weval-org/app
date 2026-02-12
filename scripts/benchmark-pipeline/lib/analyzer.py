"""Multi-stage paper analysis using Gemini."""

from __future__ import annotations

import json
import logging
from pathlib import Path

from .gemini_client import GeminiClient, parse_json_response
from .models import (
    ExtractedPrompt,
    PaperAnalysis,
    PipelineConfig,
    SufficiencyResult,
)

logger = logging.getLogger(__name__)


def load_prompt(prompts_dir: str | Path, name: str) -> str:
    """Load a prompt template from the prompts directory."""
    path = Path(prompts_dir) / name
    with open(path, "r") as f:
        return f.read()


def assess_sufficiency(
    client: GeminiClient,
    pdf_path: Path,
    config: PipelineConfig,
) -> SufficiencyResult:
    """First pass: determine if a paper has enough data for a Blueprint."""
    prompt = load_prompt(config.prompts_dir, "assess_sufficiency.txt")

    logger.info(f"Assessing sufficiency of {pdf_path.name}")
    response = client.analyze_pdf(
        pdf_path=pdf_path,
        prompt=prompt,
        model=config.sufficiency_model,
        json_output=True,
    )

    data = parse_json_response(response)
    return SufficiencyResult(**data)


def extract_methodology(
    client: GeminiClient,
    pdf_path: Path,
    config: PipelineConfig,
) -> dict:
    """Deep extraction of evaluation methodology from a paper."""
    prompt = load_prompt(config.prompts_dir, "extract_methodology.txt")

    logger.info(f"Extracting methodology from {pdf_path.name}")
    response = client.analyze_pdf(
        pdf_path=pdf_path,
        prompt=prompt,
        model=config.analysis_model,
        json_output=True,
    )

    return parse_json_response(response)


def analyze_paper(
    client: GeminiClient,
    paper_id: str,
    pdf_path: Path,
    config: PipelineConfig,
) -> PaperAnalysis:
    """Full analysis pipeline: sufficiency check then methodology extraction.

    Returns a PaperAnalysis object. If the paper is insufficient,
    the analysis will have an empty prompts list and the sufficiency
    result will indicate why.
    """
    # Step 1: Sufficiency check
    sufficiency = assess_sufficiency(client, pdf_path, config)

    if not sufficiency.is_sufficient:
        logger.info(
            f"Paper {paper_id} insufficient for Blueprint: {sufficiency.reason}"
        )
        return PaperAnalysis(
            paper_id=paper_id,
            benchmark_name=sufficiency.benchmark_name or "",
            sufficiency=sufficiency,
        )

    # Step 2: Deep methodology extraction
    methodology = extract_methodology(client, pdf_path, config)

    # Build PaperAnalysis from extracted data
    prompts = []
    for p in methodology.get("prompts", []):
        prompts.append(
            ExtractedPrompt(
                id=p.get("id", ""),
                prompt_text=p.get("prompt_text", ""),
                system_prompt=p.get("system_prompt"),
                ideal_response=p.get("ideal_response"),
                scoring_criteria=p.get("scoring_criteria", []),
                category=p.get("category"),
                source_section=p.get("source_section"),
            )
        )

    analysis = PaperAnalysis(
        paper_id=paper_id,
        benchmark_name=methodology.get("benchmark_name", ""),
        description=methodology.get("description", ""),
        evaluation_type=methodology.get("evaluation_type", ""),
        metrics=methodology.get("metrics", []),
        prompts=prompts,
        system_prompt=methodology.get("system_prompt"),
        scoring_methodology=methodology.get("scoring_methodology", ""),
        sufficiency=sufficiency,
        tags=methodology.get("tags", []),
    )

    logger.info(
        f"Analysis complete for {paper_id}: "
        f"{len(prompts)} prompts extracted, type={analysis.evaluation_type}"
    )
    return analysis


def save_analysis(analysis: PaperAnalysis, analyses_dir: str | Path) -> Path:
    """Save analysis results to a JSON file."""
    dir_path = Path(analyses_dir)
    dir_path.mkdir(parents=True, exist_ok=True)

    filename = f"{analysis.paper_id.replace('/', '_')}.json"
    path = dir_path / filename

    with open(path, "w") as f:
        json.dump(analysis.model_dump(mode="json"), f, indent=2)

    logger.info(f"Saved analysis to {path}")
    return path


def load_analysis(analyses_dir: str | Path, paper_id: str) -> PaperAnalysis | None:
    """Load a previously saved analysis."""
    filename = f"{paper_id.replace('/', '_')}.json"
    path = Path(analyses_dir) / filename

    if not path.exists():
        return None

    with open(path, "r") as f:
        data = json.load(f)

    return PaperAnalysis(**data)

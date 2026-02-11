"""Convert paper analysis to Weval Blueprint YAML."""

from __future__ import annotations

import json
import logging
from pathlib import Path

import yaml

from .gemini_client import GeminiClient
from .models import Paper, PaperAnalysis, PipelineConfig, TrackingEntry
from .utils import format_authors_short, slugify

logger = logging.getLogger(__name__)


def generate_blueprint_via_gemini(
    client: GeminiClient,
    analysis: PaperAnalysis,
    paper: Paper | TrackingEntry,
    config: PipelineConfig,
) -> str:
    """Use Gemini to generate a Blueprint YAML from the analysis.

    Returns the raw YAML string.
    """
    # Load the generation prompt template
    prompt_path = Path(config.prompts_dir) / "generate_blueprint.txt"
    with open(prompt_path, "r") as f:
        prompt_template = f.read()

    # Prepare methodology JSON for the prompt
    methodology_json = json.dumps(analysis.model_dump(mode="json"), indent=2)

    # Format the prompt
    prompt = prompt_template.replace("{methodology_json}", methodology_json)
    prompt = prompt.replace("{paper_title}", paper.title)
    prompt = prompt.replace(
        "{paper_authors}", ", ".join(paper.authors) if paper.authors else "Unknown"
    )
    prompt = prompt.replace("{arxiv_url}", paper.arxiv_url)

    logger.info(f"Generating Blueprint YAML for: {analysis.benchmark_name}")
    yaml_content = client.query(
        prompt=prompt,
        model=config.generation_model,
        json_output=False,  # We want raw YAML, not JSON
    )

    # Clean up response - strip markdown fences if present
    yaml_content = yaml_content.strip()
    if yaml_content.startswith("```"):
        lines = yaml_content.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        yaml_content = "\n".join(lines)

    return yaml_content


def generate_blueprint_deterministic(
    analysis: PaperAnalysis,
    paper: Paper | TrackingEntry,
    config: PipelineConfig,
) -> str:
    """Generate a Blueprint YAML deterministically (no AI) from structured analysis.

    This is a fallback / alternative to Gemini generation.
    """
    # Build header
    header: dict = {
        "title": analysis.benchmark_name or paper.title,
        "description": _build_description(analysis, paper),
        "author": {"name": format_authors_short(paper.authors)},
        "references": [{"title": paper.title, "url": paper.arxiv_url}],
        "tags": _build_tags(analysis, config),
        "models": config.default_models,
    }

    if analysis.system_prompt:
        header["system"] = analysis.system_prompt

    # Build prompts
    prompts = []
    for p in analysis.prompts:
        prompt_entry: dict = {
            "id": p.id or slugify(p.prompt_text[:40]),
            "prompt": p.prompt_text,
        }

        if p.ideal_response:
            prompt_entry["ideal"] = p.ideal_response

        # Build should items from scoring criteria
        should_items = _build_should_items(p.scoring_criteria)
        if should_items:
            prompt_entry["should"] = should_items

        if p.system_prompt and p.system_prompt != analysis.system_prompt:
            prompt_entry["system"] = p.system_prompt

        if p.category:
            prompt_entry["description"] = f"Category: {p.category}"

        prompts.append(prompt_entry)

    # Serialize to YAML with --- separator
    header_yaml = yaml.dump(
        header,
        default_flow_style=False,
        sort_keys=False,
        allow_unicode=True,
        width=120,
    )
    prompts_yaml = yaml.dump(
        prompts,
        default_flow_style=False,
        sort_keys=False,
        allow_unicode=True,
        width=120,
    )

    return f"{header_yaml}---\n{prompts_yaml}"


def write_blueprint(
    yaml_content: str,
    output_dir: str | Path,
    filename: str,
) -> Path:
    """Write a Blueprint YAML file to the output directory."""
    dir_path = Path(output_dir)
    dir_path.mkdir(parents=True, exist_ok=True)

    if not filename.endswith((".yml", ".yaml")):
        filename = f"{filename}.yml"

    path = dir_path / filename
    with open(path, "w") as f:
        f.write(yaml_content)

    logger.info(f"Wrote Blueprint: {path}")
    return path


def blueprint_filename_for_paper(
    analysis: PaperAnalysis, paper: Paper | TrackingEntry
) -> str:
    """Generate a filename for a Blueprint from paper/analysis."""
    name = analysis.benchmark_name or paper.title
    slug = slugify(name)
    return f"{slug}.yml"


def _build_description(
    analysis: PaperAnalysis, paper: Paper | TrackingEntry
) -> str:
    """Build a markdown description for the Blueprint."""
    parts = []

    if analysis.description:
        parts.append(analysis.description)
    else:
        parts.append(f"Evaluation based on: {paper.title}")

    if analysis.evaluation_type:
        parts.append(f"\n**Evaluation type:** {analysis.evaluation_type}")

    if analysis.metrics:
        parts.append(f"\n**Metrics:** {', '.join(analysis.metrics)}")

    if analysis.scoring_methodology:
        parts.append(f"\n**Scoring:** {analysis.scoring_methodology}")

    parts.append(
        f"\n**Source:** [{paper.title}]({paper.arxiv_url})"
    )

    return "\n".join(parts)


def _build_tags(analysis: PaperAnalysis, config: PipelineConfig) -> list[str]:
    """Build tags list combining analysis tags and defaults."""
    tags = list(config.default_tags)
    for tag in analysis.tags:
        slug_tag = slugify(tag, max_length=30)
        if slug_tag and slug_tag not in tags:
            tags.append(slug_tag)
    return tags


def _build_should_items(criteria: list[str]) -> list:
    """Convert scoring criteria strings into Blueprint should items.

    Tries to detect when deterministic checks are appropriate vs
    plain language rubric items.
    """
    items = []
    for criterion in criteria:
        # Check if this looks like it needs an exact match
        if criterion.startswith("Must contain:") or criterion.startswith("Contains:"):
            text = criterion.split(":", 1)[1].strip().strip('"').strip("'")
            items.append({"$icontains": text})
        elif criterion.startswith("Answer:") or criterion.startswith("Correct answer:"):
            text = criterion.split(":", 1)[1].strip().strip('"').strip("'")
            items.append({"$icontains": text})
        else:
            # Default to plain language rubric (LLM-judged)
            items.append(criterion)
    return items

"""Blueprint validation - mirrors weval-org/configs validation logic."""

from __future__ import annotations

import logging
from pathlib import Path

import yaml

logger = logging.getLogger(__name__)


def validate_blueprint_yaml(content: str) -> list[str]:
    """Validate a Blueprint YAML string. Returns a list of errors (empty = valid)."""
    errors = []

    try:
        docs = list(yaml.safe_load_all(content))
    except yaml.YAMLError as e:
        return [f"Invalid YAML: {e}"]

    # Filter out empty/None documents
    docs = [doc for doc in docs if doc]

    if not docs:
        return ["YAML file is empty."]

    header = {}
    prompts = []
    first_doc = docs[0]

    # Detect structure
    if len(docs) > 1 and isinstance(first_doc, dict) and isinstance(docs[1], list):
        # Structure 1: Header + prompts list
        header = first_doc
        prompts = docs[1]
    elif len(docs) == 1 and isinstance(first_doc, dict) and "prompts" in first_doc:
        # Structure 4: Single doc with prompts key
        header = first_doc
        prompts = header.get("prompts")
        if not isinstance(prompts, list):
            errors.append("The 'prompts' key must contain a list of prompts.")
    elif len(docs) == 1 and isinstance(first_doc, list):
        # Structure 3: Just a list of prompts
        prompts = first_doc
    elif all(isinstance(d, dict) for d in docs):
        # Structure 2: Stream of prompt documents or header + stream
        is_header = any(
            k in first_doc
            for k in [
                "id",
                "title",
                "models",
                "system",
                "concurrency",
                "temperatures",
                "evaluationConfig",
            ]
        )
        is_prompt = any(
            k in first_doc for k in ["prompt", "messages", "should", "ideal"]
        )
        if is_header and not is_prompt:
            header = first_doc
            prompts = docs[1:]
        else:
            prompts = docs
    else:
        errors.append("Invalid YAML structure.")
        return errors

    # Validate prompts
    if not isinstance(prompts, list):
        errors.append("Could not identify a valid list of prompts.")
    elif not prompts and not header:
        errors.append("Blueprint must contain at least one prompt or config header.")
    else:
        for i, prompt in enumerate(prompts):
            if not isinstance(prompt, dict):
                errors.append(f"Prompt at index {i} is not a valid object.")
                continue

            prompt_id = prompt.get("id", f"index-{i}")

            has_prompt = ("prompt" in prompt and isinstance(prompt.get("prompt"), str)) or (
                "promptText" in prompt and isinstance(prompt.get("promptText"), str)
            )
            has_messages = "messages" in prompt and isinstance(
                prompt.get("messages"), list
            )

            if not has_prompt and not has_messages:
                errors.append(
                    f"Prompt '{prompt_id}' must contain 'prompt' or 'messages'."
                )

            for key in [
                "should",
                "should_not",
                "points",
                "expect",
                "expects",
                "expectations",
            ]:
                if key in prompt:
                    rubric = prompt.get(key)
                    if not isinstance(rubric, list):
                        errors.append(
                            f"Rubric '{key}' in prompt '{prompt_id}' must be a list."
                        )

    return errors


def validate_blueprint_file(filepath: str | Path) -> list[str]:
    """Validate a Blueprint YAML file. Returns list of errors."""
    try:
        with open(filepath, "r") as f:
            content = f.read()
    except Exception as e:
        return [f"Could not read file: {e}"]

    return validate_blueprint_yaml(content)

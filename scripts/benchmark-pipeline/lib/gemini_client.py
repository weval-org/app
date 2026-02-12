"""Gemini API client wrapper with retry and rate limiting."""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path

from google import genai
from google.genai import types

logger = logging.getLogger(__name__)


class GeminiClient:
    """Wrapper around the google-genai SDK with retry logic."""

    def __init__(
        self,
        api_key: str,
        default_model: str = "gemini-2.5-flash-preview-05-20",
        temperature: float = 0.1,
        max_output_tokens: int = 8192,
        max_retries: int = 5,
        base_delay: float = 2.0,
    ):
        self.client = genai.Client(api_key=api_key)
        self.default_model = default_model
        self.temperature = temperature
        self.max_output_tokens = max_output_tokens
        self.max_retries = max_retries
        self.base_delay = base_delay

    def analyze_pdf(
        self,
        pdf_path: Path | str,
        prompt: str,
        model: str | None = None,
        json_output: bool = True,
    ) -> str:
        """Upload a PDF and analyze it with Gemini.

        Args:
            pdf_path: Path to the PDF file.
            prompt: The analysis prompt to send.
            model: Model override (uses default if None).
            json_output: If True, request JSON response format.

        Returns:
            The model's response text.
        """
        pdf_path = Path(pdf_path)
        model_name = model or self.default_model

        logger.info(f"Uploading PDF: {pdf_path.name} ({pdf_path.stat().st_size / 1024:.0f} KB)")

        # Upload the file
        uploaded_file = self.client.files.upload(
            file=pdf_path,
            config=types.UploadFileConfig(mime_type="application/pdf"),
        )
        logger.debug(f"Uploaded as: {uploaded_file.name}")

        # Build the content
        contents = [
            types.Content(
                parts=[
                    types.Part.from_uri(
                        file_uri=uploaded_file.uri, mime_type="application/pdf"
                    ),
                    types.Part.from_text(text=prompt),
                ]
            )
        ]

        # Configure generation
        config_kwargs: dict = {
            "temperature": self.temperature,
            "max_output_tokens": self.max_output_tokens,
        }
        if json_output:
            config_kwargs["response_mime_type"] = "application/json"

        gen_config = types.GenerateContentConfig(**config_kwargs)

        # Call with retry
        response = self._call_with_retry(model_name, contents, gen_config)

        # Clean up uploaded file
        try:
            self.client.files.delete(name=uploaded_file.name)
        except Exception:
            pass  # Non-critical

        return response

    def query(
        self,
        prompt: str,
        system_instruction: str | None = None,
        model: str | None = None,
        json_output: bool = True,
    ) -> str:
        """Send a text-only query to Gemini.

        Args:
            prompt: The prompt text.
            system_instruction: Optional system instruction.
            model: Model override.
            json_output: If True, request JSON response format.

        Returns:
            The model's response text.
        """
        model_name = model or self.default_model

        config_kwargs: dict = {
            "temperature": self.temperature,
            "max_output_tokens": self.max_output_tokens,
        }
        if json_output:
            config_kwargs["response_mime_type"] = "application/json"
        if system_instruction:
            config_kwargs["system_instruction"] = system_instruction

        gen_config = types.GenerateContentConfig(**config_kwargs)

        contents = [types.Content(parts=[types.Part.from_text(text=prompt)])]

        return self._call_with_retry(model_name, contents, gen_config)

    def _call_with_retry(
        self,
        model: str,
        contents: list,
        config: types.GenerateContentConfig,
    ) -> str:
        """Call Gemini with exponential backoff retry."""
        last_error = None

        for attempt in range(self.max_retries):
            try:
                response = self.client.models.generate_content(
                    model=model,
                    contents=contents,
                    config=config,
                )
                text = response.text
                if text is None:
                    # Check for safety blocks
                    if response.candidates and response.candidates[0].finish_reason:
                        reason = response.candidates[0].finish_reason
                        raise ValueError(f"Response blocked: {reason}")
                    raise ValueError("Empty response from Gemini")
                return text

            except Exception as e:
                last_error = e
                error_str = str(e)

                # Retry on rate limits and server errors
                if any(code in error_str for code in ["429", "503", "500"]):
                    delay = self.base_delay * (2**attempt)
                    logger.warning(
                        f"Gemini API error (attempt {attempt + 1}/{self.max_retries}): "
                        f"{error_str}. Retrying in {delay:.0f}s..."
                    )
                    time.sleep(delay)
                    continue

                # Don't retry on other errors
                raise

        raise RuntimeError(
            f"Gemini API failed after {self.max_retries} attempts: {last_error}"
        )


def parse_json_response(response: str) -> dict:
    """Parse a JSON response from Gemini, handling common issues."""
    text = response.strip()

    # Strip markdown code fences if present
    if text.startswith("```"):
        lines = text.split("\n")
        # Remove first and last fence lines
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines)

    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse Gemini JSON response: {e}")
        logger.debug(f"Response text: {text[:500]}")
        raise

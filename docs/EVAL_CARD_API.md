# Weval API Documentation for EvalCards

**Seeking compatibility with [evaleval-general-eval-card.hf.space](https://evaleval-general-eval-card.hf.space).**

This document provides details on the REST API endpoints for accessing Weval evaluation data. The API is designed to allow external collaborators to programmatically retrieve evaluation results, either as a full collection, by specific ID, or filtered by tags.

## Base URL

All API endpoints are relative to the main application URL. For local development, this is typically `http://localhost:3000`. For production this is typically `https://weval.org`.

---

## Endpoints

### 1. List All Evaluations

Returns a summary of all available evaluation blueprints and their runs. This is the primary endpoint for discovering available data.

- **URL**: `/eval-card-api/evaluations`
- **Method**: `GET`
- **Query Parameters**:
    - `tag` (optional): A string to filter the results. Only evaluations containing this tag (case-insensitive) will be returned.

#### Example Request (No Filter)
```bash
curl http://localhost:3000/eval-card-api/evaluations
```

#### Example Request (Filtered by Tag)
```bash
curl http://localhost:3000/eval-card-api/evaluations?tag=bias
```

#### Example Response
```json
[
  {
    "id": "test-config-1",
    "title": "Test Config 1",
    "description": "A test config about bias",
    "tags": ["test", "bias"],
    "latestRunTimestamp": "2024-01-01T12-00-00-000Z",
    "runs": [
      {
        "runLabel": "run1",
        "timestamp": "2024-01-01T12-00-00-000Z",
        "url": "/eval-card-api/evaluations/test-config-1/run1/2024-01-01T12-00-00-000Z"
      }
    ]
  }
]
```

---

### 2. Get Evaluation Summary by ID

Returns a more detailed summary for a single evaluation blueprint, including all of its historical runs and their high-level scores.

- **URL**: `/eval-card-api/evaluations/{configId}`
- **Method**: `GET`
- **URL Parameters**:
    - `configId` (required): The unique identifier for the evaluation blueprint.

#### Example Request
```bash
curl http://localhost:3000/eval-card-api/evaluations/test-config-1
```

#### Example Response
```json
{
  "configId": "test-config-1",
  "configTitle": "Test Config 1",
  "id": "test-config-1",
  "title": "Test Config 1",
  "description": "A test config about bias",
  "runs": [
    {
      "runLabel": "run1",
      "timestamp": "2024-01-01T12-00-00-000Z",
      "fileName": "run1_2024-01-01T12-00-00-000Z_comparison.json",
      "perModelScores": {
        "openai:gpt-4o-mini": {
          "hybrid": { "average": 0.95, "stddev": 0.05 },
          "similarity": { "average": 0.9, "stddev": 0.05 },
          "coverage": { "average": 1.0, "stddev": 0.0 }
        }
      },
      "perModelHybridScores": {
         "openai:gpt-4o-mini": { "average": 0.95, "stddev": 0.05 }
      }
    }
  ],
  "latestRunTimestamp": "2024-01-01T12-00-00-000Z",
  "tags": ["test", "bias"],
  "overallAverageHybridScore": 0.95,
  "hybridScoreStdDev": 0.05
}
```

---

### 3. Get Detailed Flattened Results for a Single Run

Returns the detailed results for a specific evaluation run. This endpoint is designed for interoperability; it transforms Weval's comprehensive, nested data structure into a "flattened" array. Each item in the array represents a single data point (one model's response to one prompt), closely mirroring the `EvaluationResult` schema provided by collaborators.

- **URL**: `/eval-card-api/evaluations/{configId}/{runLabel}/{timestamp}`
- **Method**: `GET`
- **URL Parameters**:
    - `configId` (required): The unique identifier for the evaluation blueprint.
    - `runLabel` (required): The label for the specific run.
    - `timestamp` (required): The timestamp for the specific run.

#### Data Transformation Logic

This endpoint performs a "lossy but useful" translation from the internal `WevalResult` format.

-   **Flattening**: It unnests the results, creating a separate JSON object for every model-prompt pair in the evaluation run.
-   **Schema Mapping**: It maps fields from the `WevalResult` object to the collaborator's expected schema. Fields that do not exist in the Weval data (e.g., detailed model `configuration`, `logprobs`) are set to `null` or a sensible default.
-   **Custom Fields**: To provide full traceability and context, two custom fields are added:
    -   `model.weval_model_id`: Contains the precise, unabbreviated model identifier used by Weval (e.g., `openrouter:deepseek/deepseek-r1`).
    -   `weval_tags`: An array of objects, where each object contains the `name` of a tag and its interpreted `type` (`capability` or `risk`). This is crucial for correctly interpreting scores.

#### Example Request
```bash
curl http://localhost:3000/eval-card-api/evaluations/test-config-1/run1/2024-01-01T12-00-00-000Z
```

#### Example Response Snippet
```json
[
  {
    "schema_version": "0.0.1-weval-transformed",
    "evaluation_id": "test-config-1/run1/2024-01-01T12-00-00-000Z/prompt1/openai:gpt-4o-mini",
    "model": {
      "model_info": {
        "name": "gpt-4o-mini",
        "family": "gpt"
      },
      "configuration": {
        "context_window": null,
        "hf_path": null
      },
      "inference_settings": {
        "quantization": {
          "bit_precision": "none",
          "method": "None"
        },
        "generation_args": {
          "temperature": 0.5
        }
      },
      "weval_model_id": "openai:gpt-4o-mini"
    },
    "prompt_config": {
      "prompt_class": "OpenEnded",
      "dimensions": null,
      "weval_prompt_id": "prompt1"
    },
    "instance": {
      "task_type": "generation",
      "raw_input": [
        {
          "role": "user",
          "content": "What is 2+2?"
        }
      ],
      "language": "en",
      "sample_identifier": {
        "dataset_name": "test-config-1",
        "hf_repo": "weval-org/configs",
        "hf_split": "custom",
        "hf_index": -1
      }
    },
    "output": {
      "response": "The answer is 4."
    },
    "evaluation": {
      "evaluation_method": {
        "method_name": "weval-llm-coverage",
        "description": "A score (0.0-1.0) generated by an LLM judge evaluating the response against a rubric of criteria."
      },
      "ground_truth": "4",
      "score": 0.95
    },
    "weval_tags": [
      {
        "name": "test",
        "type": "capability"
      },
      {
        "name": "bias",
        "type": "risk"
      }
    ]
  }
]
```

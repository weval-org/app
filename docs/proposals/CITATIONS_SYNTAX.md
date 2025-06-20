# Proposal: Exploring a More Natural Syntax for Citations in Blueprints

**Date:** 2024-07-26
**Author:** AI Assistant
**Status:** In Review | **Seeking Feedback**

---

## 1. Introduction & Problem Statement

In the Weval blueprint format, rubrics are defined within `should` and `should_not` blocks. Each item in these rubrics is a "Point Definition." Currently, a point can be a simple conceptual check (a plain string) or a programmatic function call.

A key feature is the ability to associate a `citation` with a point, linking a specific criterion to its source (e.g., a law, a style guide, or a requirements document). This is critical for creating auditable and transparent evaluations.

The current method for adding a citation requires converting a simple string-based point into a more verbose object:

**Current Syntax:**
```yaml
should:
  # To add a citation, a simple string...
  - "The response must mention the 'prudent man' rule."
  
  # ...must be converted into this object:
  - point: "The response must mention the 'prudent man' rule."
    citation: "Investment Advisers Act of 1940"
```

While functional, this syntax has a notable drawback: it introduces boilerplate (`text: ...`) and reduces the at-a-glance readability for the most common citation use case. For non-technical users authoring blueprints, this adds an extra layer of complexity.

## 2. Goal

This proposal aims to explore alternatives for a more intuitive, concise, and natural shorthand syntax for defining a conceptual point that includes a citation.

The ideal solution should be:
*   **Readable:** The relationship between the point and its citation should be immediately obvious.
*   **Concise:** It should minimize boilerplate for this common pattern.
*   **Unambiguous:** It must not conflict with any existing syntax for defining points (e.g., function calls).
*   **Backwards-Compatible:** It should be an addition to the existing format, not a breaking change.

## 3. Exploration of Alternatives

Below are several potential alternatives for this shorthand syntax. Each has unique trade-offs regarding readability, complexity, and technical implementation.

---

### Alternative A: Key-Value Mapping (`Point: Citation`)

This approach uses a standard YAML key-value pair, where the point's text is the key and the citation is the value.

**Proposed Syntax:**
```yaml
should:
  - "Covers the principle of 'prudent man' rule.": "Investment Advisers Act of 1940"
```

**Considerations:**
*   **Readability:** The `Point: Citation` key-value structure can be intuitive and self-documenting.
*   **Conciseness:** It eliminates the boilerplate of the `{text, citation}` object.
*   **Ambiguity:** This introduces a new, unique structure (a list item that is a single-key map). It does not conflict with existing syntax for plain strings or function calls.
*   **Notes:** While using a long sentence as a YAML key is perfectly valid, it is a less common pattern.

---

### Alternative B: Tuple / Sequence (`[Point, Citation]`)

This approach uses a two-item YAML sequence (an array or tuple) to represent the pair.

**Proposed Syntax:**
```yaml
should:
  - ["Covers the principle of 'prudent man' rule.", "Investment Advisers Act of 1940"]
```

**Considerations:**
*   **Readability:** The relationship is implied by order, which is less explicit than a key-value pair. A user must remember the correct order of items.
*   **Conciseness:** This is syntactically very compact.
*   **Ambiguity:** A primary consideration is a potential syntax clash. We already use an identical `[name, args]` tuple structure to define point functions (e.g., `[contains_any_of, ["a", "b"]]`). This could make it difficult for the parser to reliably distinguish between a citable point and a function call, potentially leading to errors.

---

### Alternative C: Delimiter-in-String

This approach embeds the citation within the point string itself, separated by a special character or sequence.

**Proposed Syntax:**
```yaml
should:
  # Using '@@' as a hypothetical delimiter
  - "Covers the 'prudent man' rule. @@ Investment Advisers Act of 1940"
```

**Considerations:**
*   **Readability:** This is reasonably readable, though it relies on the user understanding the implicit convention of the delimiter.
*   **Conciseness:** Very concise, as it keeps the entire definition on one line as a single string.
*   **Ambiguity:** A delimiter character would need to be chosen that has a low probability of appearing naturally in a point's text. An escape mechanism would be required for cases where it does.
*   **Implementation:** Requires string parsing, which can be more prone to edge cases than handling native YAML structures.

---

### Alternative D: Custom YAML Tag

This approach uses YAML's built-in tag feature to explicitly declare the item as a citable point.

**Proposed Syntax:**
```yaml
should:
  - !citable ["Covers the 'prudent man' rule.", "Investment Advisers Act of 1940"]
```

**Considerations:**
*   **Readability:** The `!citable` tag makes the intent explicit and machine-readable. However, the syntax itself may appear overly technical to non-developers.
*   **Conciseness:** It is still quite compact.
*   **Ambiguity:** This completely resolves the ambiguity of Alternative B, as the tag clearly defines the data type.
*   **Implementation:** Leverages a standard YAML feature, though it's less commonly used. The `js-yaml` parser supports it, but it adds a layer of complexity compared to handling plain types.

---

### Alternative E: Dedicated `citable` Block

This approach introduces a new, dedicated block within the prompt for points that have citations.

**Proposed Syntax:**
```yaml
- id: my-prompt
  prompt: "..."
  should:
    - "A normal, non-citable point."
    - contains: "a required word"
  citable:
    - "This point is citable.": "Source A"
    - "This one is too.": "Source B"
```

**Considerations:**
*   **Readability:** Very explicit and easy to understand. Groups all citable points together.
*   **Conciseness:** Less concise, as it adds a new block (`citable:`).
*   **Ambiguity:** No ambiguity, but it does alter the prompt's data structure.
*   **Flexibility:** A key trade-off is the loss of flexibility in ordering. It separates citable points from other criteria, preventing an author from interleaving them in a single, logical sequence.

---

### Alternative F: Vocabulary Improvement (e.g., `point` key)

This alternative does not introduce a new structure, but instead focuses on improving the clarity of the existing verbose object format by renaming the `text` key to something more descriptive and intuitive.

**Proposed Syntax:**
```yaml
should:
  # Using 'point' as the key instead of 'text'
  - point: "Covers the principle of 'prudent man' rule."
    citation: "Investment Advisers Act of 1940"
    weight: 1.5

  # 'criterion' could be another alternative
  - criterion: "Mentions fiduciary duty."
    citation: "SEC Rule 10b-5"
```

**Considerations:**
*   **Readability:** Using `point` or `criterion` is arguably more semantically correct and intuitive than the generic `text`. This improves the self-documenting nature of the format.
*   **Conciseness:** This approach does **not** reduce boilerplate for the simple use case. It only makes the existing boilerplate more readable.
*   **Ambiguity:** No ambiguity is introduced. This would be implemented as an alias for the existing `text` key.
*   **Implementation:** Very simple to implement in the parser as an alias. It could also be adopted alongside one of the structural shorthand syntaxes from other alternatives.

---

## 4. Invitation for Review & Discussion

We are seeking feedback from the review board on these alternatives. The goal is to select a path forward that best serves our users, who have a wide range of technical expertise.

Please consider the following questions:

1.  **Which format best balances conciseness with clarity for a new user?**
2.  **How important is it to avoid syntax that might feel overly "technical" (e.g., YAML tags, special delimiters)?**
3.  **Which approach introduces the least risk of ambiguity with our existing and future syntax?**
4.  **From an authoring perspective, is it more natural to interleave citable and non-citable points, or to group them separately?**
5.  **What are the respective roles of vocabulary improvement (like Alt. F) and structural shorthands (like Alts. A, C, D) in enhancing user experience? Should we adopt one, the other, or both?**
6.  **Are there other alternatives or hybrid approaches we have not yet considered?**

Open discussion on these trade-offs will help us make the most robust and user-friendly design decision. 
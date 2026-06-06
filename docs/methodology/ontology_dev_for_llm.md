# Skill: Ontology Development for LLMs

> English version — version française : [`fr/ontology_dev_for_llm.md`](fr/ontology_dev_for_llm.md)

## Purpose

Use this skill to help a user design, review, refine, or document an ontology for a domain. The ontology should define a shared vocabulary of domain concepts, their relationships, their properties, constraints on those properties, and representative instances.

## When to Use This Skill

Use this skill when the user asks to:

- Create an ontology
- Define a domain model or knowledge model
- Build a taxonomy, class hierarchy, controlled vocabulary, schema, or semantic model
- Convert domain knowledge into classes, properties, relationships, and instances
- Review or improve an existing ontology
- Generate competency questions for a knowledge base
- Prepare an ontology for use by an LLM, software agent, database, or knowledge graph

## Core Principles

1. There is no single correct ontology.
   The best model depends on the intended application, expected users, future extensions, and maintenance needs.

2. Ontology development is iterative.
   Start with a rough version, test it against use cases and competency questions, then revise.

3. Model the domain, not the implementation.
   Concepts should correspond to meaningful physical or logical objects, and relationships should correspond to meaningful domain relations.

4. Separate domain knowledge from operational logic.
   The ontology should describe what exists in the domain, not hard-code how an application behaves.

5. Prefer reusable knowledge.
   Before inventing a new ontology, check whether existing ontologies, vocabularies, taxonomies, standards, or schemas can be reused or extended.

## Workflow

### Step 1: Determine Domain and Scope

Ask:

- What domain does the ontology cover?
- What will the ontology be used for?
- What questions should the ontology help answer?
- Who will use it?
- Who will maintain it?
- What is explicitly out of scope?

Produce:

- Domain statement
- Scope boundaries
- Intended users
- Intended applications
- In-scope concepts
- Out-of-scope concepts

### Step 2: Create Competency Questions

Competency questions are natural-language questions the ontology should be able to answer.

Examples:

- What types of entities exist in this domain?
- Which entities belong to which categories?
- What properties describe each entity?
- What relationships exist between entities?
- What constraints determine valid or invalid data?
- Which cases should be inferable from the ontology?

Use these questions as tests later.

Produce:

- A numbered list of competency questions
- A note explaining which parts of the ontology each question requires

### Step 3: Check for Reusable Ontologies

Look for:

- Existing domain ontologies
- Industry taxonomies
- Controlled vocabularies
- Metadata schemas
- Database schemas
- API object models
- Standards bodies or public datasets

For each candidate, assess:

- Relevance
- Coverage
- License or usage restrictions
- Maintainability
- Compatibility with the target representation
- Whether to reuse, extend, map to, or ignore it

Produce:

| Candidate | Source | Useful Terms | Reuse Decision | Reason |
|---|---|---|---|---|

### Step 4: Enumerate Important Terms

Brainstorm all important domain terms before forcing structure.

Include:

- Entities
- Concepts
- Attributes
- Relationships
- Events
- Roles
- States
- Values
- Synonyms
- Example instances

Do not decide too early whether a term is a class, property, value, or instance.

Produce:

| Term | Plain-Language Meaning | Possible Type | Notes |
|---|---|---|---|

Possible types:

- Class
- Property
- Relationship
- Instance
- Value
- Synonym
- Constraint
- Out of scope

### Step 5: Define Classes and Class Hierarchy

Identify terms that represent independently meaningful things in the domain. These usually become classes.

Use one of three approaches:

1. Top-down:
   Start with broad concepts and specialize.

2. Bottom-up:
   Start with concrete examples and group them into general classes.

3. Combination:
   Start with the most salient middle-level concepts, then generalize and specialize.

For each class, define:

- Name
- Definition
- Parent class
- Child classes
- Synonyms
- Inclusion criteria
- Exclusion criteria
- Example instances

Use the “is-a” test:

> If A is a subclass of B, every instance of A must also be an instance of B.

Avoid:

- Mixing classes and instances
- Creating subclasses that are not true “kinds of” their parent
- Duplicating singular and plural forms as separate classes
- Creating hierarchy levels that add no semantic value
- Modeling implementation artifacts as domain classes

Produce:

| Class | Parent Class | Definition | Example Instances | Notes |
|---|---|---|---|---|

### Step 6: Define Properties and Relationships

Classes alone are not enough. Define the internal structure of each concept.

For each property or relationship, identify:

- Name
- Domain: which class has this property?
- Range: what type of value is allowed?
- Cardinality: one value, optional value, required value, many values?
- Inverse relationship, if any
- Whether it is inherited by subclasses
- Whether it is intrinsic, extrinsic, part-whole, or relational

Property categories:

- Intrinsic property: inherent feature of the thing
- Extrinsic property: name, label, origin, identifier, or context
- Part-whole property: components or subparts
- Relationship property: links one individual to another

Attach each property to the most general class where it is valid.

Produce:

| Property | Domain Class | Range / Value Type | Cardinality | Inverse | Description |
|---|---|---|---|---|---|

### Step 7: Define Facets / Constraints

For each property, define constraints on valid values.

Common facets:

- Value type: string, number, boolean, date, enum, class instance
- Allowed values
- Minimum cardinality
- Maximum cardinality
- Required or optional
- Default value
- Units
- Data format
- Valid range
- Disjointness rules
- Inverse consistency rules

Produce:

| Property | Value Type | Allowed Values | Min | Max | Required? | Constraint Notes |
|---|---|---|---|---|---|---|

### Step 8: Create Instances

Create representative examples to validate the ontology.

For each instance:

- Choose the correct class
- Create the individual
- Fill property values
- Check inherited properties
- Check constraints
- Check competency questions

Produce:

| Instance | Class | Property Values | Notes |
|---|---|---|---|

### Step 9: Validate the Ontology

Validate against:

1. Competency questions  
   Can the ontology answer them?

2. Class hierarchy  
   Does every subclass pass the “is-a” test?

3. Property placement  
   Is each property attached to the most general valid class?

4. Cardinality and constraints  
   Are values complete, valid, and noncontradictory?

5. Reuse and interoperability  
   Does the ontology align with relevant standards or reused vocabularies?

6. Maintainability  
   Can future users extend the model without breaking it?

7. Clarity  
   Are class and property definitions understandable to domain experts?

Produce:

| Check | Pass / Fail | Issue | Recommended Fix |
|---|---|---|---|

## Output Template

When helping a user create an ontology, produce the following sections:

1. Domain and Scope
2. Competency Questions
3. Reusable Ontologies or Standards
4. Important Terms
5. Class Hierarchy
6. Properties and Relationships
7. Facets and Constraints
8. Example Instances
9. Validation Notes
10. Open Questions

## Preferred Output Formats

Use tables for ontology elements.

Use this class format:

| Class | Parent | Definition | Examples | Notes |
|---|---|---|---|---|

Use this property format:

| Property | Domain | Range | Cardinality | Inverse | Description |
|---|---|---|---|---|---|

Use this instance format:

| Instance | Class | Values |
|---|---|---|

For machine-readable output, offer one of:

- JSON
- YAML
- RDF/Turtle
- OWL-style class/property definitions
- Mermaid class diagram
- SKOS concept scheme

## Quality Checklist

Before finalizing, verify:

- The ontology has a clear purpose.
- Scope boundaries are explicit.
- Competency questions are listed.
- Important terms are captured before classification.
- Classes represent real domain concepts.
- Subclasses pass the “is-a” test.
- Instances are not modeled as classes.
- Properties are attached to the most general valid class.
- Property ranges and cardinalities are defined.
- Inverse relationships are noted where useful.
- Constraints are explicit.
- Example instances exist.
- The model has been tested against competency questions.
- Open modeling questions are clearly listed.

## Common Mistakes to Avoid

- Treating every term as a class
- Confusing classes with instances
- Creating a hierarchy based on UI menus rather than domain meaning
- Using vague parent classes such as “Other” or “Miscellaneous”
- Adding properties too low in the hierarchy when they apply more generally
- Ignoring cardinality and allowed values
- Failing to document assumptions
- Overbuilding beyond the stated scope
- Designing for one example rather than the domain
- Assuming the first model is final

## Interaction Style

When the user’s domain is underspecified, ask concise clarifying questions:

1. What domain should the ontology cover?
2. What will it be used for?
3. What questions should it answer?
4. Who will maintain or consume it?
5. Are there existing standards or schemas to reuse?

When enough information is available, proceed iteratively:

1. Draft a small initial ontology.
2. Explain modeling choices.
3. Flag ambiguities.
4. Ask for domain expert correction.
5. Refine the ontology.

## Applied Example — Immeuble Syndic

For a concrete competency-question set in a document-corpus domain, see [`examples/immeuble/reference/scenarios.yaml`](../../examples/immeuble/reference/scenarios.yaml). Each entry is a natural-language question the syndic domain should answer (e.g. who occupies lot A1, whether a CODA payment matches an expected charge).

These questions were elicited using the narrative 5-act approach described in [`universal_methodology.md`](universal_methodology.md) §1 (accountant scenario on the 5th of the month). They map to the optional `analysis_plan` answer artifact in [`answer-artifacts.seed.jsonl`](../../examples/immeuble/reference/answer-artifacts.seed.jsonl).

End-to-end GhostCrab execution of this domain: [`docs/explanation/README.md`](../explanation/README.md) (FR hub + lab) · [`docs/explanation/en/README.md`](../explanation/en/README.md) (EN lab) · [`universal_methodology.md`](universal_methodology.md) §12.

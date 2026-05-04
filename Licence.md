# GhostCrab Personal — Licence Position

**GhostCrab Personal** is the SQLite-backed MCP memory server and related artefacts in this repository, built on **MindBrain** as its operational substrate.

**Trademarks.** The names **GhostCrab**, **MindBrain**, and related branding (including logos where published) are marks of **Web Igniter SRL**, Belgium. This document governs copyright and licence terms for the shipped code and content; it does not grant any right to use Web Igniter’s trade marks except as allowed by applicable law (for example fair nominative use) and by any separate branding or partner agreement.

This repository is intended to follow a layered licence model:

- source code may be released under Apache License 2.0 where explicitly marked;
- ontology, schema, model, prompt, and template content is governed separately by the MindBrain Ontology License;
- commercial operation of MindBrain-backed capabilities for third parties requires a separate MindBrain Operator License.

This file is a licence overview, not a substitute for a signed commercial agreement.

## 1. Code Layer

Unless a file or package states otherwise, the intended licence for open source code in this repository is:

**Apache License 2.0**

The Apache-2.0 layer is meant to cover implementation code that enables local development, integration, tooling, and personal use of GhostCrab / MindBrain components.

It does not automatically grant commercial operator rights over MindBrain as an operational substrate for third parties.

## 2. Ontology And Content Layer

The following materials are not automatically covered by the Apache-2.0 code grant:

- ontologies;
- schema packs;
- inference models;
- prompt packs;
- recipe libraries;
- domain templates;
- curated knowledge structures;
- sample workspaces that encode reusable business or cognitive models.

These materials are governed by the **MindBrain Ontology License** unless a specific file states otherwise.

The MindBrain Ontology License is intended to allow legitimate evaluation, development, learning, and internal use while preserving MindBrain's semantic corpus from unauthorized commercial cloning, repackaging, or competing registry use.

## 3. Operator Layer

MindBrain is more than a peripheral library. It can become the operational substrate of an application: it may encode ontologies, inference rules, agent memory, workflow state, and deterministic agent flows.

Because of that, the following uses require a separate **MindBrain Operator License (MOL)** or another written commercial agreement:

- offering MindBrain as a managed infrastructure service;
- embedding MindBrain inside a commercial SaaS product sold to customers;
- exposing MindBrain-backed capabilities to external users, customers, partners, or tenants through an API;
- redistributing a MindBrain-backed product through white-label, franchise, reseller, or OEM arrangements;
- packaging MindBrain as a default backend inside a commercial agent framework, platform, or deployment service;
- transferring the operational benefit of MindBrain to a legally distinct third party.

## 4. Internal And Development Use

The licence model is intended to allow low-friction use for:

- personal development;
- local experimentation;
- open source development;
- internal company use;
- integrators deploying MindBrain for a named end customer under the customer's licence or an approved deployment agreement.

Internal use can become operator use if the system is later exposed to customers, partners, tenants, or other legally distinct entities.

## 5. Definition: Operating MindBrain For Third Parties

For the purposes of this licence model, "operating MindBrain for third parties" includes making MindBrain or MindBrain-backed capabilities available to customers, partners, tenants, external users, or legally distinct entities, whether:

- directly as managed infrastructure;
- indirectly as part of a SaaS product;
- through APIs;
- through white-label or franchise redistribution;
- through embedded framework or platform functionality;
- through any contractual arrangement that transfers the operational benefit of MindBrain to a third party.

## 6. NPM And Public Distribution

Publishing a package publicly does not imply that every asset in the package is open source.

Packages containing only Apache-2.0 code may use:

```json
{
  "license": "Apache-2.0"
}
```

Packages that include ontology packs, schema packs, templates, proprietary content, or mixed-rights materials should instead use:

```json
{
  "license": "SEE LICENSE IN Licence.md"
}
```

Published packages should explicitly limit their included files and avoid install-time scripts unless they are necessary and documented.

## 7. Commercial Agreements

Commercial operator rights are expected to be handled through separate agreements, including:

- SaaS / OEM licences;
- white-label or franchise licences;
- managed infrastructure agreements;
- framework partnership agreements;
- enterprise subscriptions;
- deployment agreements for integrators.

These agreements may include usage scope, attribution, support, telemetry or reporting terms, revenue sharing, per-instance fees, change-of-control clauses, and service-level commitments.

## 8. Contributions And Contributor Licence Agreement (CLA)

The mechanism you are describing is not an “extension” of the SPDX licence text itself: it is a **Contributor Licence Agreement (CLA)** — a separate agreement between each contributor and the project steward (**Web Igniter SRL**, Belgium, or as stated in the signed CLA).

### Why a CLA matters for future licence changes

Merging a pull request or accepting a contribution without a CLA typically leaves that contribution governed by **the licence that applied when the contribution landed**. Contributors may then dispute or delay a later licence change affecting their copyrightable expression.

A CLA addresses this by obtaining, **before merge**, an explicit grant from the contributor that includes:

- a **perpetual, irrevocable** licence to use the contribution under the project’s then-current terms;
- the right for the steward to **sublicense** and **relicense** the contribution, including under **different** open-source licences or **proprietary / commercial** terms, as the steward’s published policy and the CLA allow.

That is the **irreversible sublicensing / relicensing** language people associate with CLAs (often modelled on Apache’s ICLA patterns), not a clause inside Apache-2.0 or MIT by itself.

### CLA versus DCO (Developer Certificate of Origin)

| | **CLA** | **DCO** |
| :--- | :--- | :--- |
| Relicensing for the steward | Typically **yes**, if the CLA says so | **No** — contribution stays under the licence in force at submit time (with the usual outbound licence of the repo) |
| Contributor friction | Higher (explicit agreement) | Lower (`Signed-off-by` in commit message) |

Projects that need freedom to evolve from community terms to layered or commercial licences **without contributor vetoes** generally use a **CLA with explicit relicensing language**, not DCO alone.

### What this repository expects

Until a formal CLA template is published and linked from `CONTRIBUTING.md` (or equivalent), treat this section as **policy intent** only: **merged third-party contributions should be accepted only under a signed CLA** (or another written grant with equivalent sublicensing scope) where required by Web Igniter’s counsel.

Illustrative wording often used in CLAs (not legally operative until executed):

> You grant Web Igniter SRL a perpetual, worldwide, non-exclusive, royalty-free, irrevocable licence to reproduce, prepare derivative works of, publicly display, publicly perform, sublicense, and distribute Your Contributions and such derivative works, including under proprietary or commercial licences.

## 9. No Legal Advice

This document describes the intended licence structure for the project. It should be reviewed and converted into final legal terms by qualified counsel before commercial release or public package publication.

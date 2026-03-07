/**
 * Research Config Template
 *
 * Copy this file to scripts/research-config-<your-domain>.ts and fill in.
 * Or use /config to generate one automatically from discovery results.
 *
 * Usage:
 *   npx tsx scripts/deep-research.ts --config <your-domain>
 */

export interface DiscoveryQuery {
  id: string;
  query: string;
}

export interface Topic {
  id: string;
  name: string;
  searchQueries: string[];
  focusAreas: string[];
}

// ─── Discovery Queries (Phase 1) ─────────────────────────────────
// 6-10 meta-research queries for landscape mapping.
// These find WHO the top practitioners are and WHAT the key sub-domains are.
// Be hyper-specific — name tools, frameworks, people, projects.

export const DISCOVERY_QUERIES: DiscoveryQuery[] = [
  {
    id: "landscape",
    query: `Who are the top 0.000001% practitioners in [YOUR DOMAIN] and what specific techniques
do they use that differ from typical tutorials? Search for engineering blogs, conference talks,
and open source implementations. What separates amateur from expert work?`,
  },
  {
    id: "techniques",
    query: `What are the most impactful techniques and patterns used in production [YOUR DOMAIN]?
Search for real-world case studies, engineering blog posts, and source code from companies
known for excellence in this area.`,
  },
  {
    id: "bottlenecks",
    query: `What are the real bottlenecks and common mistakes in [YOUR DOMAIN]?
What do most practitioners get wrong that experts handle differently?
Search for post-mortems, debugging guides, and performance analysis.`,
  },
  // Add 3-7 more discovery queries specific to your domain
];

// ─── Deep Research Topics (Phase 2) ──────────────────────────────
// 6-8 deep research topics. Each gets its own multi-phase research cycle.

export const TOPICS: Topic[] = [
  {
    id: "topic-one",
    name: "First Research Domain — Specific Title",
    searchQueries: [
      // 5-7 hyper-specific search queries
      // Name real tools, frameworks, people, projects
      // Target expert-level content, not tutorials
    ],
    focusAreas: [
      // 3-6 specific technical questions to answer
      // These define what "done" looks like for this topic
      // "How does X specifically work in Y context with Z constraints?"
    ],
  },
  // Add 5-7 more topics
];

// ─── Synthesis Context ───────────────────────────────────────────
// Describes what the researcher already knows and what they want to learn.
// Injected into every synthesis prompt to keep outputs focused and practical.

export const SYNTHESIS_CONTEXT = `The researcher wants to build deep expertise in [YOUR DOMAIN].

They currently know:
- [What they already know]
- [Their experience level]

They want to learn:
- [Specific skills or knowledge they're seeking]
- [What they'll build with this knowledge]

The research should focus on:
- [Practitioner-level insights, not tutorial basics]
- [Production techniques from real systems]
- [Specific code, formulas, and numeric values]`;

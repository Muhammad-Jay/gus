# AGENTS.md - Gus Project Guidelines

## Overview

This document defines the rules and conventions for working on Gus, an AI-assisted repository workflow automation tool. All agents must follow these guidelines strictly.

## Core Principles

1. **Repository workflow automation only** - Gus is not a coding agent. Focus on managing repository workflows (inspect, plan, commit, branch management). Do not generate application code or replace general-purpose coding assistants.
2. **AI makes recommendations; application logic controls execution** - AI output is untrusted and must be validated. Never allow AI to execute arbitrary commands or control repository operations directly.
3. **Clear module boundaries** - Maintain strict separation between CLI, application, domain, and infrastructure layers.
4. **Safety first** - Preserve user changes, validate everything, fail safely on ambiguity.
5. **Modular monolith** - Single TypeScript app with clear internal boundaries, no microservices or monorepo packages without concrete justification.

## Agent Usage Rules (MANDATORY)

### Always Use Sub-Agents
- **MANDATORY**: For any non-trivial task (exploration, implementation of features > 50 lines, multi-file changes, complex refactoring, testing), you MUST use sub-agents.
- Use the `task` tool with appropriate `subagent_type` (prefer `explore` for understanding codebase, or general-purpose for implementation).
- Delegate work to sub-agents rather than doing everything in the main agent context.
- Only do trivial single-file reads/edits yourself if absolutely necessary.

### Sub-Agent Restrictions
- **NEVER use `cat` command** - Sub-agents MUST use proper tool calls (`read`, `glob`, `grep`) to read files. The `cat` bash command is strictly forbidden for file reading.
- **NEVER use shell commands for file operations** - Use dedicated tools (read/write/edit/glob/grep). Bash is only for git, npm, builds, tests as specified.
- Sub-agents must follow all architecture rules and boundaries defined in this document.
- Sub-agents must validate all inputs and outputs.
- Sub-agents must not make assumptions - they must inspect and verify.

## Git Rules (MANDATORY)

### Always Commit Related/Finished Changes
- **MANDATORY**: After completing any logical unit of work (a feature, fix, or coherent change set), you MUST commit the changes.
- Do not leave related changes uncommitted. If changes are related and form a complete, working change, commit them.
- Commit even for intermediate working states if they represent completed sub-tasks, unless explicitly told not to commit.
- Never batch unrelated changes into one commit - group logically related changes.

### Branch Rules for Big Scope
- **For large-scope changes** (multiple files, new modules, architectural changes, features spanning multiple components), you MUST create a new branch.
- Use descriptive branch names: `feature/description`, `fix/description`, `refactor/description`, etc.
- Before creating commits on a new feature/fix/refactor of significant scope, create and switch to an appropriately named branch.
- Keep commits atomic and focused. If changes are unrelated, they should be in separate commits (Gus's core behavior).
- Never commit directly to `main`/`master` for non-trivial feature work.

### Git Best Practices
- Before committing, inspect `git status`, `git diff` to ensure only intended files are staged
- Write clear, descriptive commit messages following conventional commit style when appropriate
- Do not commit secrets, keys, or sensitive data
- Follow the repository's commit conventions if they exist

## Architecture Rules & Boundaries (CRITICAL)

### Layer Structure
```
CLI (cli/) → Application (application/) → Domain (domain/)
                ↑
            Infrastructure (infrastructure/) implements ports
```

### Dependency Rules
- **cli/**: May depend on `application/` and terminal UI utilities. MUST NOT contain repository business logic, AI prompts, policy decisions, or direct process execution.
- **application/**: May depend on `domain/` and application ports (`application/ports/`). Coordinates use cases, delegates to services. MUST NOT directly call infrastructure implementations.
- **domain/**: MUST NOT depend on `application/`, `cli/`, or `infrastructure/`. Contains pure business logic, models, rules. No Commander, Clack, AI SDK, filesystem, or subprocess imports.
- **infrastructure/**: Implements ports defined by application. May depend on `application/ports/` and `domain/`. Contains external integrations (git, AI providers, config files, etc.). MUST NOT contain workflow orchestration.
- **shared/**: Only genuinely reusable utilities and common types. MUST NOT be used as a dumping ground.

### Boundary Enforcement
- All external dependencies go through **ports/interfaces** defined in `application/ports/`
- Infrastructure implements these ports
- Composition/wiring happens in `cli/main.ts` or dedicated composition module
- Never import private implementation files across modules
- No circular dependencies
- No global service containers/singletons hiding dependencies - use explicit constructor/function injection
- AI provider details stay in `infrastructure/ai/`
- Repository-specific commands/parsing stay in `infrastructure/repository/providers/`
- UI/terminal code stays in `cli/ui/` and must be separate from business logic

### Key Contracts
- **Repository**: Application uses `RepositoryAdapter` interface - never calls git commands directly
- **AI**: Use `AiPlanner` interface - never let AI execute commands
- **All AI output is untrusted** - validate with Zod schemas
- **Use Zod** for runtime validation at all external boundaries

## Implementation Guidelines

### Technology Stack (as per MODEL.md)
- TypeScript, Node.js (ES modules), strict mode
- CLI: `commander`
- UI: `@clack/prompts` (behind UI layer, not imported in application/services)
- AI: Vercel AI SDK (`ai`, `@ai-sdk/openai`)
- Validation: `zod`
- Process: `execa` (only in infrastructure/process or repository adapters)
- Testing: `vitest`
- Build: `tsup`
- Lint/Format: `Biome`

### Module Organization
Follow the structure defined in MODEL.md section 5. Create files only when implementing corresponding responsibilities. Don't add empty abstractions prematurely.

### Development Workflow
1. **Understand before coding** - Read MODEL.md thoroughly, understand existing codebase structure
2. **Follow phases** - Build incrementally per the roadmap in MODEL.md
3. **Test first or alongside** - Write meaningful unit/integration tests for new behavior
4. **Validate boundaries** - Ensure no layer violations
5. **Commit often** - Commit related finished changes with clear messages

### Code Quality
- Prefer simple, explicit TypeScript over complex generic frameworks
- Keep functions small and focused (single responsibility)
- Use explicit types/interfaces
- Avoid speculative features
- Verify dependency APIs against current stable docs
- No comments unless explicitly necessary

## File Reading Rules
- **Always use tools**: Use `read`, `glob`, `grep` - never `cat` via bash
- Sub-agents are explicitly forbidden from using `cat`
- For large files, use offset/limit
- Read surrounding context when editing

## TODO and Planning
- When implementing major features, maintain clear task tracking
- Break large work into smaller verifiable units
- Each phase should leave the app in a coherent state

## Special Instructions
- The user wants AGENTS.md to enforce sub-agent usage, forbid `cat` in sub-agents, require committing related/finished changes, enforce branch rules for big scope, include architecture rules/boundaries, include git commit/branch rules for big scope
- All of the above are MANDATORY

---

*This document is based on MODEL.md - the product and architecture specification for Gus.*

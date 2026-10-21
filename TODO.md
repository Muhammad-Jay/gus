# Gus - Implementation TODO

This TODO tracks the implementation of Gus following the phases outlined in MODEL.md. Each phase must be completed and verified before moving to the next.

## Phase 1: Project Foundation ✅ COMPLETE
- [x] **1.1** Initialize package.json with correct metadata, dependencies, scripts
- [x] **1.2** Configure TypeScript (tsconfig.json) with strict mode, ES modules
- [x] **1.3** Configure build tool (tsup.config.ts)
- [x] **1.4** Configure testing (vitest.config.ts)
- [x] **1.5** Configure linting/formatting (biome.json)
- [x] **1.6** Create directory structure per MODEL.md section 5
- [x] **1.7** Set up CLI entry point (src/cli/main.ts, src/cli/program.ts)
- [x] **1.8** Create minimal command to verify setup
- [x] **1.9** Add basic tests for foundation
- [x] **1.10** Verify build works and tests pass

## Phase 2: Repository Adapter
- [ ] **2.1** Define repository port (src/application/ports/repository.port.ts)
- [ ] **2.2** Define domain models (RepositorySnapshot, RepositoryChange, RepositoryCapabilities)
- [ ] **2.3** Define process runner interface and implementation
- [ ] **2.4** Create repository provider registry
- [ ] **2.5** Implement Git CLI adapter (git-repository.adapter.ts)
- [ ] **2.6** Implement git command runner with safe execution (no shell interpolation)
- [ ] **2.7** Implement status parser
- [ ] **2.8** Implement diff parser
- [ ] **2.9** Add repository detection logic
- [ ] **2.10** Add branch operations (create, checkout)
- [ ] **2.11** Add staging operations (stagePaths)
- [ ] **2.12** Add commit operations
- [ ] **2.13** Add verification logic
- [ ] **2.14** Unit/integration tests for repository adapter

## Phase 3: Configuration and Instructions
- [ ] **3.1** Define configuration port
- [ ] **3.2** Define configuration schema with Zod (config.schema.ts)
- [ ] **3.3** Implement config paths resolution
- [ ] **3.4** Implement config loader (global + project precedence)
- [ ] **3.5** Implement config merger
- [ ] **3.6** Define instruction loader port
- [ ] **3.7** Implement markdown instruction loader (GUS.md)
- [ ] **3.8** Implement instruction merger
- [ ] **3.9** Define template models (commit-template)
- [ ] **3.10** Implement template loader (TEMPLATE.md)
- [ ] **3.11** Implement template validator and renderer
- [ ] **3.12** Tests for config, instructions, and templates



## Phase 6: Workflow Orchestration
- [ ] **6.1** Implement run-workflow use case
- [ ] **6.2** Implement workflow executor service
- [ ] **6.3** Coordinate inspection → planning → validation → approval → execution → verification
- [ ] **6.4** Handle partial failures correctly
- [ ] **6.5** Handle state changes during execution
- [ ] **6.6** Integration tests with temp repo and fake AI

## Phase 7: CLI Experience
- [ ] **7.1** Create UI layer (progress.ts, prompts.ts, plan-view.ts, result-view.ts)
- [ ] **7.2** Implement run command (default workflow)
- [ ] **7.3** Implement status command
- [ ] **7.4** Implement config command (get/set)
- [ ] **7.5** Implement models command
- [ ] **7.6** Implement init command
- [ ] **7.7** Add error handling and exit codes
- [ ] **7.8** Add non-interactive support
- [ ] **7.9** CLI tests

## Phase 8: Hardening and Release
- [ ] **8.1** Complete integration tests
- [ ] **8.2** Test partial-failure scenarios
- [ ] **8.3** Documentation (README.md, usage)
- [ ] **8.4** Package metadata, bin setup
- [ ] **8.5** Build and test installation
- [ ] **8.6** Final verification against MVP criteria

## Notes
- Follow all architecture rules in AGENTS.md
- Always use sub-agents for non-trivial work
- Sub-agents must never use `cat` command
- Commit related/finished changes
- Create branches for large-scope changes
- Validate all AI output with Zod
- Preserve user changes
- Repository operations only through adapter

## Phase 2: Repository Adapter ✅ COMPLETE
- [x] **2.1** Define repository port (src/application/ports/repository.port.ts)
- [x] **2.2** Define domain models (RepositorySnapshot, RepositoryChange, RepositoryCapabilities)
- [x] **2.3** Define process runner interface and implementation
- [x] **2.4** Create repository provider registry
- [x] **2.5** Implement Git CLI adapter (git-repository.adapter.ts)
- [x] **2.6** Implement git command runner with safe execution (no shell interpolation)
- [x] **2.7** Implement status parser
- [x] **2.8** Implement diff parser
- [x] **2.9** Add repository detection logic
- [x] **2.10** Add branch operations (create, checkout)
- [x] **2.11** Add staging operations (stagePaths)
- [x] **2.12** Add commit operations
- [x] **2.13** Add verification logic
- [x] **2.14** Unit/integration tests for repository adapter

## Phase 3: Configuration and Instructions ✅ COMPLETE
- [x] **3.1** Define configuration port
- [x] **3.2** Define configuration schema with Zod (config.schema.ts)
- [x] **3.3** Implement config paths resolution
- [x] **3.4** Implement config loader (global + project precedence)
- [x] **3.5** Implement config merger
- [x] **3.6** Define instruction loader port
- [x] **3.7** Implement markdown instruction loader (GUS.md)
- [x] **3.8** Implement instruction merger (via combined field)
- [x] **3.9** Define template models (commit-template)
- [x] **3.10** Implement template loader (TEMPLATE.md)
- [x] **3.11** Implement template validator and renderer
- [x] **3.12** Tests for config, instructions, and templates
## Phase 4: Workflow Domain and Policy ✅ COMPLETE
- [x] **4.1** Define workflow domain models (workflow-plan, commit-group, branch-strategy)
- [x] **4.2** Define policy models and rules
- [x] **4.3** Implement policy evaluator
- [x] **4.4** Define workflow plan schema with Zod
- [x] **4.5** Implement workflow validator service
- [x] **4.6** Implement workflow planner service (structure only)
- [x] **4.7** Define domain errors (already done in Phase 2)
- [x] **4.8** Unit tests for policy, validation, domain logic
## Phase 5: AI Planner ✅ COMPLETE
- [x] **5.1** Define AI planner port
- [x] **5.2** Create AI provider registry
- [x] **5.3** Create model resolver (placeholder)
- [x] **5.4** Implement workflow planning prompt
- [x] **5.5** Implement AI SDK planner adapter (with Zod validation)
- [x] **5.6** Ensure AI cannot execute commands
- [x] **5.7** Handle errors, timeouts, invalid responses
- [x] **5.8** Tests with mocked/fake planner

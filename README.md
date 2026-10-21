# Gus

AI-assisted repository workflow automation tool. Gus helps organize, branch, and commit changes in your repository following your configured conventions.

## Overview

Gus examines your repository changes, proposes a workflow plan, and executes approved operations (branching, staging, committing) according to your configuration and policies.

## Installation

```bash
npm install -g gus
# or
npx gus
```

## Usage

```bash
# Run the default workflow
gus

# Check repository status
gus status

# Configure settings
gus config get ai.model
gus config set ai.model gpt-4

# List available models
gus models

# Initialize project configuration
gus init
```

## Configuration

Global config: `~/.config/gus/`
- `config.json` - Settings and permissions
- `GUS.md` - Workflow instructions
- `TEMPLATE.md` - Commit message template

Project config: `.gus/` in repository root

## Architecture

Gus follows a clean modular architecture with strict layer boundaries (CLI → Application → Domain, Infrastructure implements ports). See MODEL.md for details.

## Development

```bash
npm install
npm run dev
npm run build
npm run test
npm run lint
```

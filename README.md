# RepoPilot

[![CI](https://github.com/Dahlia00/repopilot/actions/workflows/ci.yml/badge.svg)](https://github.com/Dahlia00/repopilot/actions/workflows/ci.yml)

**AI-powered GitHub pull request review and verification platform.**

RepoPilot analyzes pull requests using repository context, AI review, static security analysis, regression tests, and deterministic fix verification.

The goal is simple: **an AI-generated fix should not be trusted just because it looks correct.**

## Live Demo

**App:** https://repopilot-lake.vercel.app/app

**API:** https://repopilot-znga.onrender.com

> The Render free instance may take a few seconds to wake up after inactivity.

## Features

- GitHub pull request analysis
- Repository-aware AI code review
- Bug, security, and performance findings
- Bandit and optional Semgrep security scanning
- Evidence-based behavioral contracts
- Generated and reusable pytest regression tests
- AI-generated fix proposals
- Before / after code comparisons
- Unified diff visualization
- Deterministic fix verification
- Immutable PR commit validation
- Read-only GitHub integration by default
- Responsive dashboard
- Docker support
- GitHub Actions CI

## How It Works

```text
GitHub Pull Request
        ↓
Repository Context
        ↓
AI Review + Static Analysis
        ↓
Findings
        ↓
Behavioral Contract
        ↓
Regression Test + Fix Proposal
        ↓
Deterministic Verification
        ↓
Review Dashboard
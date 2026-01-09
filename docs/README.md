# Documentation Index

This directory contains all project documentation organized by category.

## 📂 Directory Structure

```
docs/
├── specs/          # Technical specifications
├── guides/         # Implementation guides
├── phase-reports/  # Phase completion reports
└── archive/        # Deprecated documentation
```

## 📋 Quick Links

### Start Here
- [Project Status](../PROJECT_STATUS.md) - ⭐ **Current state and next steps**
- [README](../README.md) - Project overview
- [Architecture](../ARCHITECTURE.md) - System design
- [Implementation Plan V2](../IMPLEMENTATION_PLAN_V2.md) - Phase 1-3 plan

## 📐 Specifications (`specs/`)

Core technical specifications and schemas:

- **[COOKCARD_SCHEMA_V1.md](specs/COOKCARD_SCHEMA_V1.md)** - Cook Card data structure
- **[COOKCARD_PRD_V1.md](specs/COOKCARD_PRD_V1.md)** - Product requirements document
- **[L3_IMPLEMENTATION_SPEC.md](specs/L3_IMPLEMENTATION_SPEC.md)** - Vision API extraction specification
- **[CANONICAL_LINKING_GUIDE.md](specs/CANONICAL_LINKING_GUIDE.md)** - Ingredient canonical matching guide

## 📖 Implementation Guides (`guides/`)

Step-by-step implementation guides:

- **[L2_QUALITY_STUDY_GUIDE.md](guides/L2_QUALITY_STUDY_GUIDE.md)** - How to run YouTube quality study
- **[TESTING_TRADITIONAL_RECIPES.md](guides/TESTING_TRADITIONAL_RECIPES.md)** - Traditional recipe testing guide
- **[ASR_OCR_FUTURE_IMPLEMENTATION.md](guides/ASR_OCR_FUTURE_IMPLEMENTATION.md)** - Future feature planning (ASR/OCR)

## 📊 Phase Reports (`phase-reports/`)

Detailed completion reports for each development phase:

### Phase 1: Traditional Recipe Extraction
- **[PHASE_1_COMPLETE.md](phase-reports/PHASE_1_COMPLETE.md)** - Schema.org parsing implementation

### Phase 3: Personalized Recommendation Engine
- **[PHASE_3_COMPLETE.md](phase-reports/PHASE_3_COMPLETE.md)** - Backend recommendation engine
- **[PHASE_3_UI_INTEGRATION_COMPLETE.md](phase-reports/PHASE_3_UI_INTEGRATION_COMPLETE.md)** - UI integration
- **[FRONTEND_INTEGRATION_AUDIT.md](phase-reports/FRONTEND_INTEGRATION_AUDIT.md)** - Integration audit

## 🗄️ Archived Documentation (`archive/`)

Deprecated documentation from earlier phases:

- Flow diagrams and traces
- Implementation analyses
- Deprecated architectures
- Parser audits and fixes
- Platform-specific guides
- Early prototypes and experiments

**Note:** Archive files are kept for historical reference but may be outdated.

---

## 📝 Documentation Guidelines

### When to Create New Docs

1. **Specs**: For new features, data schemas, or API contracts
2. **Guides**: For step-by-step implementation instructions
3. **Phase Reports**: When completing a major development phase
4. **Archive**: Move deprecated docs here, don't delete

### Naming Conventions

- Use UPPERCASE_WITH_UNDERSCORES.md for all docs
- Include version numbers for specs (e.g., V1, V2)
- Prefix phase reports with PHASE_N
- Be descriptive but concise

### Content Standards

- Include "Last Updated" date at bottom
- Add clear headings and table of contents
- Use code blocks for technical content
- Include examples where helpful
- Link to related documentation

---

**Last Updated:** January 17, 2025

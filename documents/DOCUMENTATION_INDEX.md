# Project Documentation Index

**Last Updated:** 2025-10-10

This index organizes all project documentation for easy reference.

---

## 📁 Active Documentation (Root Directory)

### 🏗️ Architecture & System Design
- **[ARCHITECTURE.md](../ARCHITECTURE.md)** - System architecture, tech stack, design decisions
- **[COMPLETE_FLOW_TRACE.md](../COMPLETE_FLOW_TRACE.md)** - Complete backend flow trace (user inputs URL → cook card)
- **[CANONICAL_LINKING_GUIDE.md](../CANONICAL_LINKING_GUIDE.md)** - Canonical item linking implementation

### 📋 Product Requirements
- **[COOKCARD_PRD_V1.md](../COOKCARD_PRD_V1.md)** - Cook Card product requirements document
- **[COOKCARD_SCHEMA_V1.md](../COOKCARD_SCHEMA_V1.md)** - Database schema for cook cards
- **[ASR_OCR_FUTURE_IMPLEMENTATION.md](../ASR_OCR_FUTURE_IMPLEMENTATION.md)** - Future voice & OCR features

### 🔬 Implementation Specs
- **[L2_QUALITY_STUDY_GUIDE.md](../L2_QUALITY_STUDY_GUIDE.md)** - L2 comment harvesting quality study
- **[L3_IMPLEMENTATION_SPEC.md](../L3_IMPLEMENTATION_SPEC.md)** - L3 LLM extraction implementation spec

### ✅ Current Status & Audits
- **[PROJECT_STATUS.md](../PROJECT_STATUS.md)** - Current project status and roadmap
- **[THIRD_AUDIT_FINDINGS.md](../THIRD_AUDIT_FINDINGS.md)** - Latest production readiness audit (🟢 PRODUCTION READY)
- **[FEEDBACK_ANALYSIS.md](../FEEDBACK_ANALYSIS.md)** - Production feedback analysis
- **[FIXES_APPLIED.md](../FIXES_APPLIED.md)** - Critical fixes applied for production

### 📖 General
- **[README.md](../README.md)** - Main project overview

---

## 📁 Deprecated Documentation

### 🔍 Old Audits (`./deprecated/old-audits/`)
Superseded by `THIRD_AUDIT_FINDINGS.md`:
- `BUGS_FOUND_DEEP_REVIEW.md` - Deep review bug findings
- `CRITICAL_BUGS_FIXED.md` - First round of critical bug fixes
- `LOGIC_AUDIT_FINDINGS.md` - First logic audit
- `SECOND_AUDIT_FINDINGS.md` - Second audit findings
- `CODEBASE_REVIEW_ANALYSIS.md` - Codebase review
- `GEMINI_FIXES_APPLIED.md` - Gemini API fixes
- `GEMINI_SAFETY_AUDIT.md` - Safety audit for Gemini

### 📝 Old Implementation Logs (`./deprecated/old-implementation-logs/`)
Historical day-by-day progress:
- `DAY1-2_IMPLEMENTATION_COMPLETE.md` - Days 1-2 progress
- `DAY4_READY_TO_EXECUTE.md` - Day 4 status
- `DEEP_REVIEW_COMPLETE.md` - Deep review completion
- `EXTRACTION_IMPLEMENTATION_COMPLETE.md` - Initial extraction impl
- `EXTRACTION_P0_IMPLEMENTATION_STATUS.md` - P0 features status
- `EXTRACTION_P0_INTEGRATION_COMPLETE.md` - P0 integration
- `HTML_SCRAPING_IMPLEMENTATION_COMPLETE.md` - HTML scraping impl
- `L4_VISION_IMPLEMENTATION_COMPLETE.md` - L4 vision impl
- `SECONDARY_EVIDENCE_LADDER_IMPLEMENTATION.md` - Secondary ladder
- `SECONDARY_LADDER_TEST_RESULTS.md` - Test results
- `STAGE1_MVP_COMPLETE.md` - Stage 1 MVP
- `STAGE_1C_COMPLETE.md` - Stage 1C completion
- `PROVENANCE_UI_COMPLETE.md` - Provenance UI
- `ADD_TO_SHOPPING_LIST_COMPLETE.md` - Shopping list feature
- `SOCIAL_RECIPES_TEST_SCREEN.md` - Social recipes test

### 🚀 Old Deployment Docs (`./deprecated/old-deployment-docs/`)
Superseded deployment documentation:
- `DEPLOYMENT_GUIDE.md` - Old deployment guide
- `DEPLOYMENT_STATUS.md` - Old deployment status
- `DEPLOY_NOW.md` - Deploy checklist
- `READY_FOR_DEPLOYMENT.md` - Deployment readiness
- `TESTING_BLOCKED_SUMMARY.md` - Testing blockers
- `DOCUMENTATION_CLEANUP.md` - Doc cleanup notes
- `EXECUTION_CHECKLIST.md` - Execution checklist

### 🍳 Old Recipe Planning (`./deprecated/`)
Early recipe feature planning (pre-Cook Card):
- `RECIPE_IMPLEMENTATION_PRIORITIES.md` - Early priorities
- `RECIPE_IMPLEMENTATION_WEEK1.md` - Week 1 plan
- `RECIPE_SETUP.md` - Recipe setup guide
- `RECIPE_STRATEGY_ANALYSIS.md` - Strategy analysis
- `WHY_NO_LIMITS.md` - Design decision on limits

---

## 🎯 Quick Reference Guide

### "I want to understand the system..."
1. Start with **[ARCHITECTURE.md](../ARCHITECTURE.md)** for high-level overview
2. Read **[COMPLETE_FLOW_TRACE.md](../COMPLETE_FLOW_TRACE.md)** for detailed execution flow
3. Check **[THIRD_AUDIT_FINDINGS.md](../THIRD_AUDIT_FINDINGS.md)** for production readiness

### "I want to implement a feature..."
1. Check **[COOKCARD_PRD_V1.md](../COOKCARD_PRD_V1.md)** for product requirements
2. Review **[COOKCARD_SCHEMA_V1.md](../COOKCARD_SCHEMA_V1.md)** for database schema
3. See implementation specs: **[L3_IMPLEMENTATION_SPEC.md](../L3_IMPLEMENTATION_SPEC.md)**, **[CANONICAL_LINKING_GUIDE.md](../CANONICAL_LINKING_GUIDE.md)**

### "I want to fix a bug..."
1. Read **[FIXES_APPLIED.md](../FIXES_APPLIED.md)** to see recent fixes
2. Check **[THIRD_AUDIT_FINDINGS.md](../THIRD_AUDIT_FINDINGS.md)** for known issues
3. Review **[COMPLETE_FLOW_TRACE.md](../COMPLETE_FLOW_TRACE.md)** to trace logic

### "I want to know what's done..."
1. Check **[PROJECT_STATUS.md](../PROJECT_STATUS.md)** for current status
2. See **[THIRD_AUDIT_FINDINGS.md](../THIRD_AUDIT_FINDINGS.md)** for production readiness
3. Browse `./deprecated/old-implementation-logs/` for historical progress

### "I want to deploy..."
1. Read **[THIRD_AUDIT_FINDINGS.md](../THIRD_AUDIT_FINDINGS.md)** - production ready checklist
2. See **[FIXES_APPLIED.md](../FIXES_APPLIED.md)** - latest changes deployed
3. Check **[COMPLETE_FLOW_TRACE.md](../COMPLETE_FLOW_TRACE.md)** - understand what will run

---

## 📊 Document Categories

### Living Documents (Updated Regularly)
- `PROJECT_STATUS.md` - Updated as features are completed
- `README.md` - Updated with setup instructions

### Reference Documents (Stable)
- `ARCHITECTURE.md` - Updated when architecture changes
- `COOKCARD_PRD_V1.md` - Updated when requirements change
- `COOKCARD_SCHEMA_V1.md` - Updated when schema changes
- `COMPLETE_FLOW_TRACE.md` - Updated when flow changes

### Point-in-Time Documents (Historical)
- `THIRD_AUDIT_FINDINGS.md` - Latest audit snapshot
- `FEEDBACK_ANALYSIS.md` - Analysis at specific date
- `FIXES_APPLIED.md` - Fixes as of specific date
- All deprecated documents

---

## 🗂️ Maintenance Guidelines

### When to Create New Docs
- New major feature (create implementation spec)
- Architecture change (update ARCHITECTURE.md)
- Major refactor (create migration guide)
- Production issue (create incident report)

### When to Update Existing Docs
- Feature completion (update PROJECT_STATUS.md)
- Schema changes (update COOKCARD_SCHEMA_V1.md)
- Requirements change (update PRD)
- Flow changes (update COMPLETE_FLOW_TRACE.md)

### When to Deprecate Docs
- Document represents completed milestone (move to `old-implementation-logs/`)
- Document superseded by newer version (move to `old-audits/`)
- Document is obsolete deployment guide (move to `old-deployment-docs/`)
- Document has no future reference value (move to appropriate deprecated folder)

### Deprecated Directory Structure
```
documents/deprecated/
├── old-audits/                    # Superseded audits and reviews
├── old-implementation-logs/       # Day-by-day progress logs
├── old-deployment-docs/           # Obsolete deployment guides
└── [other categories as needed]
```

---

## 📈 Document Health

| Category | Active Docs | Deprecated Docs | Total |
|----------|-------------|-----------------|-------|
| Architecture | 3 | 0 | 3 |
| Product Specs | 3 | 5 | 8 |
| Implementation | 2 | 15 | 17 |
| Status/Audits | 4 | 7 | 11 |
| **Total** | **13** | **29** | **42** |

**Cleanup Ratio:** 69% deprecated (good - shows active maintenance)

---

*This index is maintained to help navigate the 42 markdown files in the project.*

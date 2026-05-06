# Psychometric Premium Phase 1 Content Review

## Purpose & Safety Positioning
These assessments are educational and career guidance tools for students. They are **not** clinical diagnostic tools.

**Mandatory report disclaimer (all 3 tests):**
> This report is for educational and guidance purposes only. It is not a medical, psychiatric, or clinical diagnosis.

## Tests Seeded (Inactive by Default)
1. Career Clarity & Direction Test (`career-clarity-direction-test`) – ₹499
2. Learning Style & Study Strategy Test (`learning-style-study-strategy-test`) – ₹299
3. Personality Strengths & Growth Profile (`personality-strengths-growth-profile`) – ₹399

Each test includes:
- 24 questions
- Mixed types: single_choice, multiple_choice, scale, numeric, text
- 4 dimensions
- 4 scoring bands
- report templates (summary, strengths, improvement areas, recommendations, disclaimer)
- `is_active = false` for admin review safety

## Dimensions
- Career test: self_awareness, career_exposure, decision_readiness, action_discipline
- Learning test: learning_preference, attention_management, study_planning, revision_execution
- Personality test: self_regulation, collaboration, problem_solving, growth_mindset

## Question & Option Design
- Baseline per test: 24 questions
- Type mix per test:
  - single_choice: 11
  - multiple_choice: 5
  - scale: 5
  - numeric: 2
  - text: 1 (optional)
- Options seeded for choice questions only:
  - 4 options per single_choice question
  - 4 options per multiple_choice question
- Total options per test: 64

### Choice Options (single_choice)
1. Strongly agree (4)
2. Agree (3)
3. Neutral (2)
4. Disagree (1)

### Choice Options (multiple_choice)
1. Very relevant to me (4)
2. Somewhat relevant (3)
3. Not sure yet (2)
4. Not relevant (1)

### Scale Questions
- min_scale_value = 1
- max_scale_value = 10

## Scoring Bands
### Career Clarity & Direction Test
1. Needs Career Clarity (0–24%)
2. Developing Career Awareness (25–49%)
3. Strong Career Readiness (50–74%)
4. Excellent Career Alignment (75–100%)

### Learning Style & Study Strategy Test
1. Needs Study Foundation (0–24%)
2. Developing Study Awareness (25–49%)
3. Strong Study Readiness (50–74%)
4. Excellent Study Alignment (75–100%)

### Personality Strengths & Growth Profile
1. Needs Growth Foundation (0–24%)
2. Developing Personal Awareness (25–49%)
3. Strong Personal Readiness (50–74%)
4. Excellent Strength Alignment (75–100%)

## Report Template Logic
`scoring_config.report_templates` includes:
- `summary`
- `strengths`
- `improvement_areas`
- `recommendations`
- `disclaimer`

Templates use placeholders such as:
- `{{band_label}}`
- `{{top_dimensions}}`
- `{{growth_dimensions}}`

## Idempotent Import Behavior
Seed file: `supabase/seed_psychometric_premium_phase1.sql`

Behavior:
- Upsert test shell by slug.
- Update core fields if test exists.
- Upsert questions by `psychometric_questions.metadata.seed_key`.
- Upsert options by `psychometric_question_options.metadata.seed_key`.
- No deletes for non-seed content.
- No orders/attempts/answers/reports are created.

## Admin Runbook
1. Run in staging first:
   - `psql < supabase/seed_psychometric_premium_phase1.sql`
2. Review in admin UI:
   - `/admin/psychometric/tests`
3. Validate:
   - title/slug/pricing/duration/instructions
   - question count, type mix, dimensions, options (`option_text` usage)
   - scoring bands and report templates
4. Activate manually after review (`is_active=true` in admin).


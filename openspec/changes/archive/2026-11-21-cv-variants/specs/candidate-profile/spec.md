# Spec Delta

## ADDED Requirements

### Requirement: CV variants
The system SHALL let the owner keep named CV variants beside the master CV as local Markdown files, each with a name and a short "use for" description. The master CV remains the complete, authoritative CV. With no variants, the system SHALL behave as with a single CV.

#### Scenario: Variants load with the profile
- **WHEN** the profile folder holds the master CV and two valid variants "AI Engineer" and "Tech Lead"
- **THEN** both variants are available to scoring and drafting, and Settings lists them with their "use for" text

#### Scenario: Invalid variant
- **WHEN** a variant file has no name or an empty body
- **THEN** that variant is ignored, the other variants still load, and Settings shows the error for that file

#### Scenario: No variants
- **WHEN** the profile folder holds only the master CV
- **THEN** scoring, drafts and applications behave as before and no CV recommendation is shown

### Requirement: CV variant editing from the UI
The system SHALL let the owner add, edit, rename and delete CV variants from Settings, saving them to the local profile folder. A variant SHALL be limited to 20,000 characters and the number of variants to 8.

#### Scenario: Add a variant
- **WHEN** the owner adds a variant named "Freelance" with a "use for" line and text, and saves
- **THEN** a variant file is created in the profile folder and the variant appears in the list

#### Scenario: Delete a variant used by applications
- **WHEN** the owner deletes a variant that past applications recorded as sent
- **THEN** the file is removed and those applications keep showing the variant's name

### Requirement: Refresh CV recommendations
The system SHALL let the owner refresh CV recommendations after changing variants, re-scoring only shortlisted offers that have no application, within the daily scoring cap. Changing variants alone SHALL NOT re-score every open offer.

#### Scenario: Refresh after adding a variant
- **WHEN** the owner adds a variant and clicks "Refresh CV recommendations"
- **THEN** shortlisted offers without an application are queued for scoring, the count is shown, and other offers keep their current score

#### Scenario: Over the daily cap
- **WHEN** the refresh queues more offers than the remaining daily scoring cap
- **THEN** the offers over the cap wait as "awaiting score" until the next day, as for any other scoring

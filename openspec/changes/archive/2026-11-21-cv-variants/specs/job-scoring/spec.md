# Spec Delta

## ADDED Requirements

### Requirement: CV variant recommendation
When CV variants exist, the same scoring call SHALL also return the recommended variant for the offer, a one-sentence reason, and up to five gaps: offer requirements the master CV supports but the recommended variant does not show. Fit SHALL still be judged against the master CV, so variants SHALL NOT change the overall score or sub-scores.

#### Scenario: Leadership offer
- **WHEN** variants "AI Engineer" and "Tech Lead" exist and a Head of Engineering offer is scored
- **THEN** the score recommends "Tech Lead" with a reason, and the offer detail shows "Recommended CV: Tech Lead"

#### Scenario: Gap shown
- **WHEN** an offer asks for Kubernetes, the master CV mentions Kubernetes and the recommended variant does not
- **THEN** the gaps include Kubernetes and the offer detail lists it under the recommendation

#### Scenario: Unknown variant in model output
- **WHEN** the model names a variant that does not exist
- **THEN** the score is stored without a recommendation and the offer detail shows no recommendation

#### Scenario: Recommendation does not change the score
- **WHEN** the same offer is scored with and without variants and the model returns the same fit
- **THEN** the overall score and sub-scores are stored identically and the hard eligibility rules apply as before

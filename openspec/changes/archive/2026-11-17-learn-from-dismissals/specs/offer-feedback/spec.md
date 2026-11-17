## ADDED Requirements

### Requirement: Structured dismiss reasons
When the owner dismisses an offer, the system SHALL ask for one or more reasons from a fixed list (salary too low, stack or technologies, seniority, company or sector, location or time zone, contract type, language, duplicate or already seen, other), an optional note of at most 300 characters, and a "Don't learn from this" switch. A reason is optional; a dismissal without reasons is still recorded.

#### Scenario: Dismiss with reasons
- **WHEN** the owner dismisses an offer choosing "contract type" and "location or time zone" with the note "US W2 only"
- **THEN** the offer is dismissed, the reasons and note are stored as feedback for that offer, and the timeline shows "Marked dismissed: Contract type, Location or time zone — US W2 only"

#### Scenario: Duplicate is not learned by default
- **WHEN** the owner selects only "duplicate or already seen"
- **THEN** the "Don't learn from this" switch turns on, and the owner can turn it off

#### Scenario: Hide the company from the dismiss dialog
- **WHEN** the owner selects "company or sector" and ticks "Hide all offers from Acme"
- **THEN** Acme is added to the hidden companies and its open offers are hidden, as with the existing "Hide company" action

### Requirement: Feedback record
The system SHALL record feedback for every dismissal, shortlist and application, with the offer, the kind of decision, the reasons, the note, whether it may be learned from, and the time. Moving a dismissed or shortlisted offer back to new SHALL withdraw that feedback so it is no longer used for learning.

#### Scenario: Restore withdraws the dismissal
- **WHEN** the owner restores a dismissed offer
- **THEN** its dismissal feedback is marked withdrawn and the next learning run ignores it

### Requirement: Learned preferences
The system SHALL condense learnable feedback into at most 20 learned preferences, each a plain-language sentence of at most 200 characters with a polarity ("avoid" or "prefer") and the offers that support it. Learning SHALL use the owner's Claude subscription under the extraction budget. Offer content given to the model SHALL be treated as untrusted data; the owner's reasons and notes are trusted. A learned preference MUST NOT contain URLs or instructions, and SHALL be rejected if it does.

#### Scenario: Learn from repeated dismissals
- **WHEN** the owner dismissed 5 offers from crypto companies with reason "company or sector"
- **THEN** a learning run produces an active "avoid" preference such as "Avoid crypto and web3 companies" linked to those 5 offers, and the owner gets an in-app notification "Job Radar learned 1 new preference"

#### Scenario: Positive signals temper learning
- **WHEN** the owner dismissed 3 fintech offers for salary but shortlisted 4 other fintech offers
- **THEN** the run does not produce a preference to avoid fintech

### Requirement: Learning runs
A learning run SHALL start when at least 5 learnable dismissals arrived since the last run, once a day when any new feedback exists, or when the owner asks. A run SHALL NOT start when the extraction budget is exhausted; the pending feedback waits for the next run.

#### Scenario: Learn now
- **WHEN** the owner clicks "Learn now" with 2 new dismissals pending
- **THEN** a learning run starts without waiting for the threshold

#### Scenario: Budget exhausted
- **WHEN** the extraction budget for the day is used up
- **THEN** no learning run starts and the feedback stays pending until the budget allows it

### Requirement: Owner control of learned preferences
The system SHALL show every learned preference in Settings with its polarity, status, origin (learned or written by the owner) and supporting offers, and SHALL let the owner edit, disable, re-enable, delete or add preferences and run learning on demand. A preference the owner edited or wrote SHALL never be changed or removed by a learning run. A preference the owner disabled or deleted SHALL NOT be re-created by later runs with the same meaning.

#### Scenario: Edit locks a preference
- **WHEN** the owner edits "Avoid crypto companies" to "Avoid crypto companies unless the role is AI engineering"
- **THEN** the preference shows as written by the owner and later learning runs keep it unchanged

#### Scenario: Disabled preference is not re-learned
- **WHEN** the owner disabled "Avoid agencies" and later dismisses two more agency offers
- **THEN** the next run does not add a new preference to avoid agencies

### Requirement: Hard preference suggestions
The system SHALL suggest raising the minimum hourly or daily rate when at least 2 offers dismissed with reason "salary too low" in the last 60 days state a rate above the owner's current minimum, proposing the highest such stated rate rounded up to a multiple of 5. A suggestion SHALL change the preferences only when the owner accepts it; a rejected suggestion SHALL NOT be shown again for the same value.

#### Scenario: Accept a rate suggestion
- **WHEN** the owner dismissed offers at 55 €/h and 62 €/h for salary while the minimum is 50 €/h
- **THEN** Settings shows "Raise your minimum hourly rate to 65 EUR?", and accepting it saves 65 as the EUR minimum in the preferences file

### Requirement: Rescore after learning
When the active learned preferences change, the system SHALL offer to rescore open offers, stating how many offers it will rescore, and the rescore SHALL respect the daily scoring budget.

#### Scenario: Offer to rescore
- **WHEN** a learning run adds or changes an active preference and 42 offers are open
- **THEN** the offers list and Settings show "Learned preferences changed: rescore 42 open offers?" until the owner rescores or dismisses the banner

# Spec Delta

## ADDED Requirements

### Requirement: Phone-width layout
At 390 px wide, no screen SHALL scroll sideways as a page. Wide content SHALL either fit or scroll inside its own area, as the pipeline board and the offers filter row do. On narrow screens, the People page SHALL show each person as a stacked entry with its contacts, offers and actions reachable without sideways scrolling. Settings SHALL work at that width without being laid out specially for it. On narrow screens, where the sidebar opens over the page, choosing a page in it SHALL close it.

#### Scenario: Sidebar on a phone
- **WHEN** the owner opens the sidebar on a phone and chooses Pipeline
- **THEN** the pipeline opens and the sidebar closes

#### Scenario: Dashboard on a phone
- **WHEN** the owner opens the dashboard 390 px wide
- **THEN** the page is no wider than the screen, and the figures, the star chart and the tables fit or scroll inside their own cards

#### Scenario: People on a phone
- **WHEN** the owner opens People 390 px wide
- **THEN** each person is one stacked entry, and the edit and merge buttons can be pressed without scrolling sideways

#### Scenario: Long preference tags
- **WHEN** a target role longer than the screen is shown in the Preferences form 390 px wide
- **THEN** the tag wraps within the form and the page does not scroll sideways

### Requirement: Back to the offers list
The offer detail SHALL show a "Back to offers" link. When the offer was opened from the offers list, the link SHALL return to that list with the same filters, search, sort and page; otherwise it SHALL return to the offers list as it opens by default.

#### Scenario: Back with filters
- **GIVEN** the owner filtered the offers list to strong contract offers
- **WHEN** they open an offer and press "Back to offers"
- **THEN** the list shows strong contract offers again

#### Scenario: Opened from elsewhere
- **WHEN** the owner opens an offer from the dashboard and presses "Back to offers"
- **THEN** the offers list opens with its default filters

## MODIFIED Requirements

### Requirement: Pipeline board
The system SHALL provide a board view of applications grouped by stage, where moving a card changes its stage. The board SHALL use the full width of the work area with its own horizontal scroll, fill the window height with each column scrolling vertically on its own, and offer a search that keeps only the cards whose company, role or next step match, ignoring case and accents. On a touch screen, a card SHALL be picked up only by pressing and holding it; a swipe that starts on a card SHALL scroll the board or the column, and a tap SHALL open the card. While a card is being moved, with the mouse or by touch, it SHALL be drawn above every column until it is dropped.

#### Scenario: Card visible while moving
- **WHEN** the owner drags a card over another column
- **THEN** the card stays visible above that column until it is dropped, and Escape cancels the move

#### Scenario: Drag to final interview
- **WHEN** the owner drags a card to "final interview"
- **THEN** the stage changes and the timeline records it

#### Scenario: Search the pipeline
- **WHEN** the owner types "proseware" in the pipeline search
- **THEN** only Proseware's card stays on the board, the count shows "1 of N applications", and Escape brings every card back

#### Scenario: Long column
- **WHEN** a stage holds more cards than fit in the window
- **THEN** that column scrolls on its own while the board and the other columns stay in place

#### Scenario: Swipe across the board on a phone
- **WHEN** the owner swipes sideways starting on a card, on a touch screen
- **THEN** the board scrolls to the next column and no card moves

#### Scenario: Press and hold to move a card
- **WHEN** the owner presses and holds a card on a touch screen and drops it on another column
- **THEN** the stage changes and the timeline records it

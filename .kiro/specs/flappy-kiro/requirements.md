# Requirements Document

## Introduction

Flappy Kiro is a retro, browser-based endless-scroller game in the style of Flappy Bird. The player controls a white ghost character that must navigate through a continuous series of green pipes. The ghost is constantly pulled downward by gravity, and the player provides upward impulses (flaps) to keep the ghost airborne and steer it through gaps between pipes. The game tracks the player's current score and persists a high score across sessions. The visual presentation matches the reference screenshot: a light blue hand-drawn background with rounded white cloud shapes, green pipes entering from the top and bottom of the play area, a dark gray ground strip at the bottom, and a score display at the bottom reading the current score and high score (for example, "Score: 2 | High: 2").

The game reuses existing workspace assets: `assets/ghosty.png` for the ghost sprite, `assets/jump.wav` for the flap sound, and `assets/game_over.wav` for the game-over sound.

## Glossary

- **Game**: The Flappy Kiro browser application as a whole, responsible for coordinating game state, rendering, input, scoring, and audio.
- **Ghost**: The player-controlled character, rendered from `assets/ghosty.png`, that moves vertically within the Play_Area in response to gravity and flap inputs.
- **Play_Area**: The bounded rectangular region of the browser canvas in which the Ghost moves and Pipes scroll.
- **Pipe**: A pair of green obstacles consisting of a top segment descending from the ceiling and a bottom segment rising from the ground, separated by a vertical Gap through which the Ghost can pass.
- **Gap**: The vertical opening between the top and bottom segments of a Pipe.
- **Ground**: The dark gray horizontal strip at the bottom of the Play_Area that forms the lower boundary.
- **Cloud**: A rounded white decorative shape rendered semi-transparently within the background region above the Ground, scrolling horizontally as a parallax background effect independent of gameplay.
- **Ceiling**: The top boundary of the Play_Area.
- **Flap_Input**: A player action (mouse click, touch tap, or Spacebar press) that triggers an upward impulse on the Ghost.
- **Score**: The count of Pipes the Ghost has successfully passed during the current play session.
- **High_Score**: The highest Score achieved across play sessions, persisted in browser local storage.
- **Game_State**: The current mode of the Game, which is one of Ready, Playing, or Game_Over.
- **Ready_State**: The Game_State before a play session begins, in which the Ghost is idle and awaiting the first Flap_Input.
- **Playing_State**: The Game_State during active play, in which gravity, flapping, Pipe scrolling, collision detection, and scoring are active.
- **Game_Over_State**: The Game_State after the Ghost collides with a Pipe, the Ground, or the Ceiling.
- **Local_Storage**: The browser's persistent key-value storage used to retain the High_Score across sessions.

## Requirements

### Requirement 1: Game Initialization and Ready State

**User Story:** As a player, I want the game to load in a ready state showing the ghost and background, so that I understand the game is prepared and know how to begin.

#### Acceptance Criteria

1. WHEN the Game finishes loading all required assets in the browser, THE Game SHALL enter the Ready_State within 3 seconds of page load.
2. WHILE the Game is in the Ready_State, THE Game SHALL render the Ghost at a fixed starting position horizontally centered within the Play_Area and vertically centered within the Play_Area.
3. WHILE the Game is in the Ready_State, THE Game SHALL render the light blue background, the white cloud shapes, and the Ground strip.
4. WHILE the Game is in the Ready_State, THE Game SHALL display the current Score as 0.
5. WHEN the Game enters the Ready_State, THE Game SHALL load the High_Score from Local_Storage.
6. IF no High_Score value exists in Local_Storage, THEN THE Game SHALL display the High_Score as 0.
7. IF the High_Score value retrieved from Local_Storage is not a non-negative integer, THEN THE Game SHALL display the High_Score as 0 and overwrite the stored value with 0.
8. IF Local_Storage is unavailable or cannot be read, THEN THE Game SHALL display the High_Score as 0 and continue entering the Ready_State without interruption.

### Requirement 2: Flap Input and Starting Play

**User Story:** As a player, I want to flap the ghost by clicking, tapping, or pressing the spacebar, so that I can control the ghost and start playing.

#### Acceptance Criteria

1. WHILE the Game is in the Ready_State, WHEN a Flap_Input is received, THE Game SHALL transition to the Playing_State within 50 milliseconds of receiving the input.
2. WHILE the Game is in either the Ready_State or the Playing_State, WHEN a Flap_Input is received, THE Game SHALL play the sound `assets/jump.wav` exactly once per Flap_Input.
3. WHILE the Game is in the Playing_State, WHEN a Flap_Input is received, THE Game SHALL replace the Ghost's current vertical velocity with a fixed upward impulse value, discarding any accumulated downward velocity.
4. THE Game SHALL treat a mouse click, a single touch tap, and a Spacebar key press as equivalent Flap_Input events, applying identical behavior for each.
5. WHILE the Game is in the Playing_State, WHEN two or more Flap_Input events are received within a single animation frame, THE Game SHALL process exactly one Flap_Input and discard the remainder for that frame.

### Requirement 3: Gravity and Ghost Movement

**User Story:** As a player, I want the ghost to fall under gravity and rise when I flap, so that controlling its altitude is the core challenge.

#### Acceptance Criteria

1. WHILE the Game is in the Playing_State, THE Game SHALL increase the Ghost's downward vertical velocity by a fixed gravity acceleration between 0.3 and 0.6 pixels per frame per frame on each animation frame.
2. WHILE the Game is in the Playing_State, THE Game SHALL update the Ghost's vertical position based on the Ghost's current vertical velocity on each animation frame.
3. WHILE the Game is in the Playing_State, IF the Ghost's downward vertical velocity would exceed a fixed maximum downward velocity between 8 and 15 pixels per frame, THEN THE Game SHALL clamp the Ghost's downward vertical velocity to that maximum value.
4. WHEN the Game transitions from the Ready_State to the Playing_State, THE Game SHALL set the Ghost's vertical velocity to the fixed upward impulse value defined for a Flap_Input.
5. WHILE the Game is in the Ready_State, THE Game SHALL hold the Ghost at its fixed starting vertical position and SHALL set the Ghost's vertical velocity to 0 without applying gravity acceleration.

### Requirement 4: Pipe Generation and Scrolling

**User Story:** As a player, I want green pipes to continuously scroll toward me with gaps to fly through, so that the game provides an endless series of obstacles.

#### Acceptance Criteria

1. WHILE the Game is in the Playing_State, THE Game SHALL move every Pipe horizontally from right to left at a fixed scroll speed between 120 and 200 pixels per second on each animation frame.
2. WHILE the Game is in the Playing_State, THE Game SHALL generate each new Pipe at a fixed horizontal spacing interval between 200 and 350 pixels, measured center-to-center from the previously generated Pipe.
3. WHEN the Game transitions to the Playing_State, THE Game SHALL spawn the first Pipe off the right edge of the Play_Area.
4. WHEN a new Pipe is generated, THE Game SHALL set the vertical position of the Pipe's Gap so that the Gap lies fully within the Play_Area with at least a 50-pixel margin from both the Ceiling and the Ground, selected at random within that range.
5. WHEN a new Pipe is generated, THE Game SHALL set the Gap height to a fixed value of at least twice the Ghost's rendered height.
6. WHEN a Pipe's right edge moves past the left edge of the Play_Area, THE Game SHALL remove the Pipe from active rendering, collision detection, and scoring.
7. WHILE the Game is in the Playing_State, THE Game SHALL render each Pipe in green with a top segment descending from the Ceiling to the top edge of the Gap and a bottom segment rising from the Ground to the bottom edge of the Gap.

### Requirement 5: Collision Detection

**User Story:** As a player, I want the game to end when the ghost hits a pipe, the ground, or the ceiling, so that there is a clear failure condition.

#### Acceptance Criteria

1. WHILE the Game is in the Playing_State, IF on any animation frame the Ghost's bounding box intersects the bounding box of any segment of any Pipe, THEN THE Game SHALL transition to the Game_Over_State.
2. WHILE the Game is in the Playing_State, IF on any animation frame the bottom edge of the Ghost's bounding box reaches or passes the top edge of the Ground, THEN THE Game SHALL transition to the Game_Over_State.
3. WHILE the Game is in the Playing_State, IF on any animation frame the top edge of the Ghost's bounding box reaches or passes the Ceiling, THEN THE Game SHALL transition to the Game_Over_State.
4. WHEN the Game transitions to the Game_Over_State as a result of a collision, THE Game SHALL evaluate no further collision transitions until the Game next enters the Playing_State.

### Requirement 6: Scoring

**User Story:** As a player, I want to earn a point each time the ghost passes a pipe, so that I can measure my performance.

#### Acceptance Criteria

1. WHEN the Game transitions to the Playing_State at the start of a play session, THE Game SHALL set the Score to 0.
2. WHILE the Game is in the Playing_State, WHEN the Ghost's horizontal position passes the right edge of a Pipe that has not yet been marked as scored, THE Game SHALL increment the Score by 1 and mark that Pipe as scored.
3. WHILE the Game is in the Playing_State, WHEN the Score is incremented, THE Game SHALL update the score display at the bottom of the Play_Area to the current Score value within one animation frame.
4. WHILE the Game is in the Playing_State, THE Game SHALL display the current Score as a non-negative integer in the score display at the bottom of the Play_Area.
5. THE Game SHALL count each Pipe toward the Score exactly once per play session, such that the Score never increases by more than 1 for any single Pipe.

### Requirement 7: High Score Persistence

**User Story:** As a player, I want my best score to be saved and shown, so that I can try to beat my previous record across sessions.

#### Acceptance Criteria

1. WHEN the Game transitions to the Game_Over_State, IF the current Score is greater than the stored High_Score, THEN THE Game SHALL set the High_Score to the current Score.
2. WHEN the Game transitions to the Game_Over_State, IF the current Score is less than or equal to the stored High_Score, THEN THE Game SHALL leave the High_Score unchanged.
3. WHEN the High_Score is set to a new value, THE Game SHALL write the High_Score to Local_Storage within 100 milliseconds.
4. IF writing the High_Score to Local_Storage fails, THEN THE Game SHALL retain the current in-memory High_Score value for the remainder of the session and continue operating without interrupting gameplay.
5. WHEN the High_Score is set to a new value, THE Game SHALL update the High_Score shown in the score display at the bottom of the Play_Area to match the new value.
6. WHILE the Game is in any Game_State, THE Game SHALL display the current High_Score as a non-negative integer in the score display at the bottom of the Play_Area.

### Requirement 8: Game Over and Restart

**User Story:** As a player, I want clear feedback when I lose and a way to play again, so that I can quickly retry.

#### Acceptance Criteria

1. WHEN the Game transitions to the Game_Over_State, THE Game SHALL play the sound `assets/game_over.wav` exactly once.
2. WHILE the Game is in the Game_Over_State, THE Game SHALL stop increasing the Ghost's velocity by gravity, hold the Ghost at its vertical position at the moment of transition, and stop moving all Pipes.
3. WHILE the Game is in the Game_Over_State, THE Game SHALL display a game-over indicator and a textual restart prompt overlaid on the Play_Area, and SHALL continue to display the current Score and High_Score.
4. WHEN the Game enters the Game_Over_State, THE Game SHALL ignore every Flap_Input received within 500 milliseconds of entering the Game_Over_State.
5. WHILE the Game is in the Game_Over_State, WHEN a Flap_Input is received after the 500-millisecond ignore window has elapsed, THE Game SHALL reset the Score to 0, reset the Ghost to its starting position, remove all active Pipes, and transition to the Ready_State.

### Requirement 9: Visual Presentation

**User Story:** As a player, I want the game to look like the retro hand-drawn reference design, so that the experience matches the intended aesthetic.

#### Acceptance Criteria

1. THE Game SHALL render the Ghost using the image asset `assets/ghosty.png` scaled to a fixed size that fits within the Play_Area.
2. THE Game SHALL render the background filling the entire Play_Area in a light blue color, overlaid with at least two rounded white Clouds positioned within the background region above the Ground.
3. THE Game SHALL render each Cloud at a fixed opacity between 0.3 and 0.7, such that the light blue background remains visible through each Cloud.
4. WHILE the Game is in the Ready_State, the Playing_State, or the Game_Over_State, THE Game SHALL move every Cloud horizontally from right to left on each animation frame.
5. THE Game SHALL assign the Clouds at least two distinct horizontal scroll speeds, such that at least two Clouds move at different speeds from each other to produce a parallax effect.
6. THE Game SHALL set every Cloud's horizontal scroll speed to a value strictly less than the Pipe scroll speed defined for the Playing_State.
7. WHEN a Cloud's right edge moves past the left edge of the Play_Area, THE Game SHALL reposition the Cloud off the right edge of the Play_Area so that the Cloud re-enters from the right.
8. THE Game SHALL render all Pipes, including both the top and bottom segments, in green.
9. THE Game SHALL render the Ground as a dark gray strip spanning the full horizontal width of the Play_Area along its bottom edge.
10. THE Game SHALL render the score display at the bottom of the Play_Area in the format "Score: {current} | High: {high}", where {current} is replaced by the integer value of the current Score and {high} is replaced by the integer value of the High_Score.
11. IF the image asset `assets/ghosty.png` fails to load, THEN THE Game SHALL render the Ghost as a solid placeholder shape at the Ghost's position so that the Ghost remains visible.

### Requirement 10: Browser Execution and Input Responsiveness

**User Story:** As a player, I want the game to run smoothly in my browser and respond immediately to input, so that gameplay feels fluid and fair.

#### Acceptance Criteria

1. THE Game SHALL run in the current and immediately prior major versions of Chrome, Firefox, Safari, and Edge on a desktop operating system without requiring the installation of any browser plugin or extension.
2. WHILE the Game is in the Playing_State, THE Game SHALL update and render the Game at a target rate of 60 frames per second, maintaining a sustained rate of at least 55 frames per second.
3. WHILE the Game is in the Playing_State, WHEN a Flap_Input is received, THE Game SHALL apply the upward impulse to the Ghost no later than 50 milliseconds after the Flap_Input is received.
4. WHILE the Game is in the Playing_State, THE Game SHALL scale all gravity, flap-impulse, and Pipe-scroll motion by the elapsed time between consecutive rendered frames so that the Ghost's and Pipes' on-screen movement over any one-second interval remains within 5 percent of the movement produced at exactly 60 frames per second.
5. IF the Game is loaded in a browser that does not support the rendering capabilities required for the Play_Area, THEN THE Game SHALL display a message indicating that the browser is unsupported and SHALL NOT enter the Playing_State.

# Area Tactics — Tester Manual

## Overview

Area Tactics is a two-player turn-based strategy game played on a hexagonal grid. Players alternate turns moving units and issuing build orders. The player who destroys all opponent units wins.

The key design principle: **actions taken during your turn only resolve at the start of your *next* turn**. Plan ahead — everything you do now takes effect when your turn comes around again.

---

## The Map

The map is a hex grid that can be panned by clicking and dragging. It contains:

| Feature | Symbol | Description |
|---------|--------|-------------|
| **Base** | ★ (star) | Starting position; anchors territory claims and support chains |
| **Depot** | ▬ (rectangle) | Expands unit capacity when claimed |
| **Facility** | ⬡ (hexagon) | Allows building new units when claimed |

---

## Units

Each player starts with a set of units placed near their base. Units have a **type** that determines all their properties.

### Unit Types

| Type | Effect | AoI | Power | Movement | Energy | Condition | Cost |
|------|--------|-----|-------|----------|--------|-----------|------|
| Infantry | Direct | 0–2 | 4 | 3 | 6 | 10 | 1 |
| Mortar | Indirect | 3–5 | 10 | 2 | 4 | 5 | 2 |
| Scout | Direct | 0–4 | 6 | 7 | 10 | 6 | 2 |
| Convoy | Support | 0–4 | 0 | 5 | 5 | 5 | 1 |

### Unit Stats

- **Energy** — shown as a blue bar. Absorbs damage first. Regenerates each turn based on support status: +1 when not under enemy influence (base), +1 more when on a supported tile. So: unsupported and not under fire = 1, supported and under fire = 1, supported and not under fire = 2, unsupported and under fire = 0.
- **Condition** — shown as a red bar. Takes damage when energy runs out. A unit with 0 condition is **destroyed**.
- **AoI (Area of Influence)** — the range of hex-distances in which this unit affects others. AoI 0–2 means the unit influences everything from the tile it stands on out to 2 hexes away.
- **Power** — how much damage this unit deals per turn to each enemy it influences.
- **Movement** — how many hexes the unit can be moved during a turn (measured from where it started that turn).
- **Cost** — counts against your unit capacity.

### Effect Types

- **Direct** — influences (and damages) enemies in the AoI range who are within line of sight. Can claim territory.
- **Indirect** — influences enemies at longer range (AoI starts at 3+). Can claim territory.
- **Support** — does no damage. Extends the supply network from your base.

---

## Taking a Turn

On your turn you can **move any of your units** and **issue build orders** at facilities. You can move units and change build orders as many times as you like before ending the turn. Only click **End Turn** when you are happy with your positions.

### Moving Units

1. **Click a unit** to select it. Valid destinations are highlighted in green.
2. **Click a highlighted tile** to move there.
3. Click the selected unit again, or any other tile, to deselect without moving.

A unit can be moved multiple times during a turn, but the allowed range is always measured from where it **started** that turn.

### Ending Your Turn

Click **End Turn** (top-right) to pass the turn to your opponent. Effects do **not** resolve at the moment you end your turn. At the **start of each player's turn**, the following happen in order:

1. Any build orders placed during the previous turn are checked and the new unit spawns (if conditions are still met).
2. That player's units deal damage to all enemies within their range.
3. That player's units regenerate energy.

---

## Combat

Combat is automatic — you do not issue attack orders.

**At the start of each turn**, every unit damages all enemies within its AoI:

- **Energy drain**: damage reduces enemy energy first.
- **Overflow to condition**: any damage exceeding remaining energy reduces condition instead.
- **Destruction**: a unit whose condition reaches 0 is removed from the map.

### Split Damage

If a unit has **multiple enemies** in its AoI at the same time, its power is **halved** (rounded down) **against each target individually** — every targeted enemy takes the same reduced damage.

### Flanking *(optional feature)*

If an enemy unit is damaged by **two or more of your units that do not influence each other** (i.e. they are out of each other's AoI), the damage is increased by **50%** (rounded down). A unit with a large AoI — such as a Mortar — can create a flanking angle on its own if it reaches the enemy from a range outside the other attacker's AoI.

Split damage and flanking cancel each other out.

---

## Territory & Claiming

Your units establish a **claimed territory** extending outward from your base. A tile is claimed by you if:

1. It contains **your base**, OR
2. It is **influenced by one of your units** and is **adjacent to a tile already claimed by you**.

Claims spread in a connected chain from your base — you cannot claim distant tiles without bridging the gap.

### Claim Types

| Type | Condition |
|------|-----------|
| **Direct** | At least one of your Direct or Indirect units influences the tile |
| **Indirect** | The tile is claimed only by your Indirect units |
| **Unique** | Only your non-Support units influence this tile |
| **Contested** | Both players' non-Support units influence this tile |

Support (Convoy) units do claim territory (extending your coloured area along the supply chain) but do not affect claim uniqueness — an enemy convoy alone cannot contest your facility or depot.

Claimed tiles are **tinted in your team's colour**. Contested tiles show a mixed colour. Indirect claims use a dotted-line indicator.

---

## Unit Capacity & Depots

Each player has a **Unit Capacity** — the maximum total unit cost you can field. Your current **Unit Load** is shown in the HUD (top right).

- Load can exceed capacity if you lose territory — no immediate penalty, but you cannot build new units until load drops below capacity.

### Depots

Capturing depots expands your capacity:

| Depot claim | Capacity bonus |
|-------------|---------------|
| Direct + Unique | **+2** |
| Direct + Contested | **+1** |
| Indirect or unclaimed | **+0** |

---

## Building Units

New units are built at **Facility** tiles (hexagon symbol). To build:

1. You must have a **Direct + Unique** claim on the facility.
2. The build must not cause your unit load to exceed your capacity.
3. **Click the facility tile** — the build menu opens.
4. Select a unit type from the list. Unaffordable types are greyed out.
5. Check the right panel for details and a unit portrait.
6. Click **Build** to confirm, or **×** / click outside the panel to cancel.

You can change or cancel a build order any number of times during your turn. A **build order** means the unit appears at the **start of your next turn**, provided:

- You still have a Direct + Unique claim on the facility, AND
- The facility tile is unoccupied.

If either condition fails when your turn starts, the build order is **cancelled** and no unit is produced.

Units under construction appear **translucent** on the map. They are fully built when your next turn begins.

---

## Support *(optional feature)*

Convoys extend a **support network** from your base, keeping distant units supplied.

### What is Supported?

A tile is **supported** if it is:

1. Within **3 hexes** of your base, OR
2. Influenced by a **Convoy unit that is itself standing on a supported tile**.

Convoys chain from one to the next, extending the supply line as far as you need.

### Effect of Support

Support grants **+1 energy regeneration per turn** to units on supported tiles. The effect stacks with the base regeneration:

| Condition | Regen per turn |
|-----------|---------------|
| Unsupported, not under enemy fire | **1** |
| Supported, under enemy fire | **1** |
| Supported, not under enemy fire | **2** |
| Unsupported, under enemy fire | **0** |

### Visualisation

- **Cyan lines** connect the base and convoys across the support network (thicker lines = backbone connections).
- **Thinner cyan lines** connect convoys to the combat units they supply.

---

## HUD & Interface

| Element | Location | Description |
|---------|----------|-------------|
| **Turn indicator** | Top right | Current turn number and active player |
| **Unit load** | Top right | `Load: X / Y` for each player (blue = P1, red = P2) |
| **End Turn** | Top right | Confirms your turn |
| **Unit info box** | Bottom right | Appears when hovering a tile with a unit; shows full stats |
| **Event ticker** | Bottom bar | Log of all game events in reverse-chronological order |

---

## Victory

A player wins when **all opponent units are destroyed**, or when **all of the opponent's bases are simultaneously occupied** by your units at the start of a turn.

### Base Capture

If **all of your bases** are simultaneously occupied by enemy units at the start of any turn, you lose immediately — even if you still have units on the field. Protecting your bases is as important as destroying the enemy.

---

## Quick Reference

| Action | How |
|--------|-----|
| Pan the map | Click and drag on the map |
| Select a unit | Click it |
| Move a unit | Select it, then click a green-highlighted tile |
| Deselect | Click the selected unit again, or any non-destination tile |
| Open build menu | Click a facility you have a Direct + Unique claim on |
| End turn | Click **End Turn** button |
| Start a new game | Game-over screen → Back to Menu, or reload |

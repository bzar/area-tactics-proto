# Area Tactics — Tester Manual

## Overview

Area Tactics is a two-player turn-based strategy game played on a hexagonal grid. Players alternate turns moving units and issuing build orders. The player who destroys all opponent units wins.

The key design principle: **actions taken during your turn only resolve at the start of your *next* turn**. Plan ahead — everything you do now takes effect when your turn comes around again.

---

## The Map

The map is a hex grid that can be panned by clicking and dragging. It contains:

| Feature | Symbol | Description |
|---------|--------|-------------|
| **Base** | ★ (star) | Starting position; anchors territory claims |
| **Depot** | ▬ (rectangle) | Expands unit capacity when claimed |
| **Facility** | ⬡ (hexagon) | Allows building new units when claimed |

---

## Units

Each player starts with a set of units placed near their base. Units have a **type** that determines all their properties.

### Unit Types

| Type | Effect | AoI | Power | Movement | Energy | Condition | Cost |
|------|--------|-----|-------|----------|--------|-----------|------|
| Infantry | Direct | 0–2 | 4 | 3 | 10 | 10 | 1 |
| Mortar | Indirect | 3–5 | 10 | 2 | 10 | 5 | 2 |
| Scout | Direct | 0–4 | 6 | 7 | 20 | 10 | 2 |
| Convoy | Support | 0–4 | 0 | 5 | 5 | 5 | 1 |

### Unit Stats

- **Energy** — shown as a blue bar. Absorbs damage first. Regenerates by 1 each turn when not under enemy influence (or when supported — see Support below).
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

Click **End Turn** (top-right). At that moment:

1. All your units that are in range of enemy units deal damage.
2. Your units that are **not** under enemy influence (or are supported) regenerate 1 energy.
3. Any build orders you placed this turn are checked and the new unit spawns (if conditions are still met).
4. The next player's turn begins.

---

## Combat

Combat is automatic — you do not issue attack orders.

**At the start of each turn**, every unit damages all enemies within its AoI:

- **Energy drain**: damage reduces enemy energy first.
- **Overflow to condition**: any damage exceeding remaining energy reduces condition instead.
- **Destruction**: a unit whose condition reaches 0 is removed from the map.

### Split Damage

If a unit has **multiple enemies** in its AoI at the same time, its power is **halved** (rounded down) for each target. Spreading your units out helps avoid this.

### Flanking *(optional feature)*

If an enemy unit is influenced by **two or more of your units from different angles** (one influencing unit does not influence the other), the damage is increased by **50%** (rounded down).

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
| **Indirect** | The tile is claimed only by your Support (Convoy) units |
| **Unique** | Only your units influence this tile |
| **Contested** | Both players' units influence this tile |

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

Units on supported tiles **regenerate 1 energy per turn even while under enemy influence**. Without support, units under enemy fire cannot regenerate.

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

A player wins when **all opponent units are destroyed**.

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

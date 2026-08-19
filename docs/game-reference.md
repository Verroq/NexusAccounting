# Nexus Legacy Game Reference

Complete reference for game systems, buildings, ships, research, and API structures.

---

## **API ENDPOINTS STRUCTURE**

### Fleet Missions
**Endpoint:** `GET /api/fleet/missions`  
**Purpose:** Returns active and returning fleet missions with fleet composition and status

**Key Payload Fields:**
- `missions[]`: Array of all active missions
- `missionType`: survey, mine, raid, patrol, etc.
- `status`: dispatched, surveying, mining, returning, completed
- `fleetComposition[]`: Ships with quantities and properties
- `distance`: Linear distance in galaxy units
- `speed`: Effective fleet speed (affected by tech bonuses)
- `travelTime`: In seconds
- `cargo`: Resource contents and cycle tracking
- `targetFieldType`: ore, hydrogen, plasma, cryo_ice (null for non-mining)
- `miningEfficiencyPercent`: 0-100+ efficiency at dispatch
- `patrolCoverage`: Coverage percentage for patrol missions
- `isProbeFleet`: Boolean flag
- `maxFleetSlots`: Total simultaneous active fleets allowed

### Fleet Fuel Estimate
**Endpoint:** `GET /api/fleet/fuel-estimate`  
**Purpose:** Calculates fuel cost and travel parameters for a proposed fleet dispatch

**Request Structure:**
```json
{
  "sourcePlanetId": 74062,
  "targetSystemId": 5752,
  "ships": [
    {
      "shipDefId": 21,
      "quantity": 1
    }
  ]
}
```

**Response Fields:**
- `fuelCost`: Actual hydrogen consumed (after tech bonuses)
- `baseFuelCost`: Cost before bonuses
- `fuelBonus`: Decimal percentage modifier from Fuel Efficiency research
- `distance`: Precise calculated distance
- `hydrogenAvailable`: Current planet supply
- `sufficient`: Boolean—enough fuel to dispatch
- `totalCargoCapacity`: Sum of all ship cargo capacity
- `travelTime`: In seconds
- `antimatterCost`: Required antimatter for special missions
- `maxRange`: Maximum distance this fleet can reach
- `tankerBonus`: Bonus from tanker ships included
- `inRange`: Boolean—within max range
- `hasDamagedShips`: Affects range calculation

### Galaxy System Planets
**Endpoint:** `GET /api/galaxy/systems/{systemId}/planets`  
**Purpose:** Multi-entity endpoint—returns all scannable entities in a system

**Response Structure:**
```json
{
  "planets": [
    {
      "id": 74062,
      "systemId": 5752,
      "name": "Homeworld",
      "position": 3,
      "planetType": "terra|crystalline|gaseous|volcanic|desert|ice",
      "size": 220,
      "temperature": 24,
      "userId": 1234,
      "isHomeworld": true,
      "colonizedAt": "ISO-8601",
      "ownerName": "Commander"
    }
  ],
  "asteroidFields": [
    {
      "id": 11748,
      "systemId": 5752,
      "name": "G21-52-AF1",
      "position": 9,
      "fieldType": "ore|hydrogen|plasma|cryo_ice|bio",
      "richness": 1-5,
      "totalResources": 100000,
      "remainingResources": 85000
    }
  ],
  "moons": [
    {
      "id": 8102,
      "planetId": 74062,
      "systemId": 5752,
      "name": "Homeworld Moon",
      "moonType": "rocky|icy|volcanic",
      "size": 50,
      "buildingSlots": 8,
      "userId": 1234
    }
  ]
}
```

### Planet Detail
**Endpoint:** `GET /api/planets/{planetId}`  
**Purpose:** Full planet state including resources, production rates, storage, buildings

**Key Resource Fields:**
- `ore`, `silicates`, `hydrogen`, `alloys`: Base resources
- `cryoIce`, `quantumDust`, `plasmaCore`, `bioExtract`, `darkMatter`, `antimatter`: Rare resources
- `oreRate`, `silicatesRate`, `hydrogenRate`, `alloysRate`: Production per minute
- `oreStorage`, `silicatesStorage`, `alloysStorage`: 415,975 (standard max)
- `rareResourceStorage`: Determined by Expanded Warehousing research (max 20,000 at Lv.5)
- `energyProduced`, `energyConsumed`: Determines production multiplier
- `population`, `maxPopulation`, `populationGrowthRate`: Per-minute growth
- `shieldHp`, `shieldMaxHp`, `shieldRegenRate`: Shield mechanics
- `usedBuildingSlots`, `maxBuildingSlots`: Building limit
- `resourceRevision`: Increments per update

### Planets Shipyard
**Endpoint:** `GET /api/planets/{planetId}/shipyard`  
**Purpose:** Returns all 31 ships with build costs, combat stats, and availability

**Key Ship Fields:**
- `available`: True only if `researchMet && shipyardMet`
- `researchMet`: All requirements satisfied
- `shipyardMet`: Shipyard level requirement met
- `currentShipyardLevel`: Current planet shipyard level
- `costOre/Silicates/Hydrogen/Alloys`: Per-unit build cost
- `rareCosts`: Extra resource requirements as object
- `buildTime`: Seconds per unit
- `hp`, `shieldHp`, `attack`: Combat stats
- `speed`: Base speed (used for travel calculations)
- `effectiveSpeed`: Speed after Impulse/Warp Drive bonuses
- `cargoCapacity`, `miningCargoCapacity`, `hangarCapacity`: Transport specs
- `repairCostPerUnit`: ~50% of build cost
- `allowedCargo`: null or restricted type list
- `populationCost`: Population consumed per unit (capital ships only)

---

## **RESOURCES**

### Basic Resources (4)

| Resource | Production | Storage | Use Case |
|----------|-----------|---------|----------|
| **Ore** | Ore Mine (+30/level) | 415,975 | Ships, buildings, alloys |
| **Silicates** | Silicate Mine (+20/level) | 415,975 | Research, buildings |
| **Hydrogen** | Hydrogen Processor (+15/level) | 415,975 | Fleet fuel, alloy production |
| **Alloys** | Alloy Foundry (+10/level) | 404,475 | High-end ships, buildings |

### Rare Resources (6)
Shared storage cap determined by **Expanded Warehousing** research:

| Research Level | Storage Cap |
|---|---|
| None | 10,000 |
| Lv.1 | 12,000 |
| Lv.2 | 14,000 |
| Lv.3 | 16,000 |
| Lv.4 | 18,000 |
| Lv.5 (max) | **20,000** |

| Resource | Source |
|----------|--------|
| **Plasma Core** | Asteroid mining, Plasma fields |
| **Cryo Ice** | Cryo planets, Ice Drill ships |
| **Quantum Dust** | Gas Collector ships, missions |
| **Bio Extract** | Bio Complex; Terra +100% output |
| **Dark Matter** | Ice Drill ships, rare missions |
| **Antimatter** | High-end missions, rare buildings |

---

## **SHIPS (31 Total)**

### Mining Ships

| Ship | Cost | Capacity | Speed | Specialty |
|------|------|----------|-------|-----------|
| **Mining Vessel** | 546O, 273S, 91H, 91A | 300 mining | 6 | Ore 50/cycle, Plasma 25/cycle |
| **Excavator** | 1365O, 910S, 455H, 455A | 500 mining | 3 | **+20% yield bonus** |
| **Gas Collector** | 455O, 364S, 182H, 91A | 400 mining | 5 | Gas 15/cycle, Quantum Dust 3/cycle |
| **Ice Drill** | 728O, 455S, 273H, 182A | — | 4 | Ice 25, Dark Matter 3/cycle |

### Escort Ships

| Ship | Cost | HP/Shield/ATK | Speed | Specialty |
|------|------|---|---|---|
| **Interceptor** | 819O, 455S, 182H, 182A | 200/50/35 | 18 | Anti-fighter x5 RF |
| **Cruiser** | 1820O, 910S, 455H, 228A | 700/200/65 | 8 | Anti-fighter x5 RF, mainstay |

### Other Notable Ships

| Ship | Cost | Speed | Notes |
|------|------|-------|-------|
| **Probe** | 46O, 228S | 25 | Fastest, survey only |
| **Tanker** | 364O, 182S, 91H, 137A | 6 | Extends fleet range |
| **Freighter** | 273O, 91S, 46A | 5 | Standard transport |

---

## **ZONE SECURITY TYPES**

| Zone Type | Risk Level | Rules |
|-----------|---|---|
| **Sentinel** | Low | Capital systems, limited PvP, NPC enforcement |
| **Open** | High | Lawless frontier, full PvP enabled |
| **Dead Space** | Restricted | Special ships required (Stealth, Hacker) |
| **Rift Space** | Very High | Quantum Synthesizer production, dangerous |

---

## **KEY CONSTANTS & CALCULATIONS**

### Excavator Mining Bonus
- **+20% yield** applies to entire mining fleet
- Multiplicative with efficiency research bonuses

### Travel Time Calculation
```
travelTime(seconds) = distance / effectiveSpeed
effectiveSpeed = baseSpeed × (1 + Impulse Drive + Warp Drive bonuses)
```

### Fuel Consumption
```
fuelCost = baseFuelCost × (1 + tankerBonus) × (1 - Fuel Efficiency bonus)
```

### Cost Scaling Formula
```
Cost(Level n) = BaseCost × (Multiplier ^ (n-1))
Multiplier x1.5 applies from Lv.11+ (high-level multiplier)
```

---

**Last Updated:** 2026-07-20  
**Scope:** Game mechanics reference for development and strategy planning

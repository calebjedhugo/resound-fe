# Resound Roadmap

Update this checklist when completing features. Mark items ✅ when done, ⚠️ when in-progress, ❌ when not started.

## Core Gameplay
- ✅ First-person movement and camera
- ✅ Recording system (5-slot inventory)
- ✅ Playback with beat quantization
- ✅ Clap mechanic (displaces creature timing, quantized to 16th notes)
- ⚠️ Accidental overwrite prevention for recordings (basic, could improve)

## Audio Systems
- ✅ MusicalClock with BPM sync and metronome
- ✅ Web Audio synthesis (oscillators + envelopes)
- ✅ Multiple instrument types (Piano, Random, Fountain)
- ✅ Harmony analysis (consonance/dissonance detection)
- ✅ Spatial audio with distance falloff

## Entities
- ✅ Creatures with force-based movement (harmony attraction/repulsion)
- ✅ Gates that unlock when correct song played
- ✅ Fountains (puzzle completion targets)
- ✅ Walls (solid collision)
- ✅ Ramps with directional elevation

## Puzzle System
- ✅ JSON-based puzzle definitions
- ✅ 4 playable puzzles (2 easy, 2 medium)
- ✅ Progress tracking via localStorage
- ✅ Puzzle manifest system

## UI/Menus
- ✅ Main menu with puzzle selection
- ✅ Pause menu (ESC key)
- ✅ Progress indicators (green checkmarks)
- ✅ Recording UI indicator
- ✅ Debug UI (toggle with 'I' key)

## Development Tools
- ❌ Puzzle editor (dev-only) - currently manual JSON editing
- ❌ Notation editor for songs (considering Vexflow or custom SVG)
- ✅ Dev server setup (Vite)
- ❌ Automated deployment to Raspberry Pi

## Deployment
- ✅ Vite build configuration
- ❌ Production deployment pipeline
- ❌ Raspberry Pi hosting setup (planned)

## Future/Planned
- ❌ Extract `src/audio/` folder to standalone npm package
- ❌ Backend with authentication
- ❌ Cloud progress sync (currently localStorage only)
- ❌ Additional puzzles post-release

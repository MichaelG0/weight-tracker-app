# Weight Tracker

A cross-platform weight and goal tracking application built with modern Angular, Ionic and Capacitor.

Weight Tracker is designed around more than simply recording scale readings. It stores weight history locally, calculates a smoothed weight trend, tracks goals and provides progress analytics to help distinguish meaningful changes from normal day-to-day fluctuations.

The project also serves as an exploration of modern Angular architecture, reactive state management, local-first persistence and mobile-oriented UI development.

## Features

- Log, edit and delete weight entries
- Weight history with notes
- Weight Loss, Weight Gain and Maintenance goals
- Smoothed weight trend using an exponentially weighted moving average
- Interactive progress charts
- Daily weight and trend visualization
- Goal history and active-goal tracking
- Weekly rate-of-change analysis
- Goal progress and remaining-weight calculations
- Estimated goal-date projections
- Maintenance-range tracking
- Progress and consistency indicators
- Goal-aware recommendations
- Multiple weight units
- User-configurable profile and preferences
- Light and dark themes
- Persistent local data
- Responsive mobile-first interface

## Tech Stack

### Application

- Angular 20
- TypeScript 5.9
- Ionic 8
- Capacitor 8
- RxJS

### Data & State

- SQLite
- Capacitor Community SQLite
- Angular Signals
- RxJS Observables
- Computed reactive state

### Visualization

- Chart.js
- chartjs-plugin-zoom
- Hammer.js

## Modern Angular

The application makes use of modern Angular APIs and architectural patterns including:

- Standalone components
- `signal()`
- `computed()`
- `effect()`
- `inject()`
- `toSignal()`
- `viewChild()`
- `ChangeDetectionStrategy.OnPush`
- Functional application bootstrapping
- Standalone Ionic components

The goal is to keep application state predictable and reactive while minimizing unnecessary rendering.

## Local-First Data Architecture

Weight Tracker stores its data locally using SQLite rather than requiring a remote backend.

The application maintains separate reactive collections for:

- Weight entries
- User settings
- Goals

Database updates are synchronized into RxJS streams and exposed to the UI as Angular signals.

On native platforms, persistence is handled through Capacitor SQLite.

On the web, the application initializes `jeep-sqlite` so the same database abstraction can be used during browser development.

## Weight Trend

Daily scale weight can fluctuate significantly, so the application calculates a smoothed trend instead of relying only on individual measurements.

The trend is calculated using an exponentially weighted moving average (EWMA), with the weighting adjusted according to the time between entries.

This trend is then used throughout the application for progress calculations, goal analysis and visualizations.

## Progress Analytics

The dashboard derives additional information from the user's weight history and active goal, including:

- Current trend weight
- Weekly rate of change
- Percentage of body weight changing per week
- Total progress
- Remaining weight to goal
- Estimated time to goal
- Goal schedule position
- Maintenance stability
- Logging consistency
- Data-quality indicators

The application distinguishes between Weight Loss, Weight Gain and Maintenance goals so that calculations and feedback can adapt to the selected objective.

## Interactive Charts

The Progress view uses Chart.js to visualize both raw scale readings and the smoothed trend.

Users can:

- Switch between different time ranges
- Show or hide daily measurements
- Show or hide the trend line
- Inspect individual data points
- View goal periods
- Zoom and navigate through historical data

Chart styling also reacts to the selected application theme.

## Project Structure

```text
src/app/
├── components/    # Reusable UI and modal components
├── directives/    # Shared UI behaviour
├── pages/         # Dashboard, History, Progress and Settings
├── pipes/         # Presentation helpers
├── services/      # Database, theme and application state
└── utils/         # Date and unit conversion utilities
```

The application is organized around four primary areas:

```text
Dashboard
History
Progress
Settings
```

## Running Locally

### Prerequisites

You will need:

- Node.js
- npm
- Git

### 1. Clone the repository

```bash
git clone https://github.com/MichaelG0/weight-tracker-app.git
cd weight-tracker-app
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start the development server

```bash
npm start
```

The application will then be available through the Angular development server.

Development builds initialize the local database and seed development data.

## Building

Create a production build with:

```bash
npm run build
```

The project is configured for Capacitor and can be adapted for native Android or iOS builds using the standard Capacitor workflow.

## Design Goals

The project focuses on four areas:

1. **Modern Angular** — applying current Angular APIs rather than relying on older NgModule-era patterns.
2. **Reactive architecture** — deriving UI state from signals and observable data instead of manually synchronizing components.
3. **Local-first persistence** — keeping the core application usable without requiring a remote service.
4. **Useful visualization** — turning raw measurements into trends and progress information that are easier to interpret.

## Disclaimer

Weight Tracker is a personal software project intended for tracking and visualizing user-entered data. It is not intended to provide medical advice.

## Author

**Michael Guarino**

Full Stack Developer — Angular / Java / Spring Boot

[GitHub](https://github.com/MichaelG0)
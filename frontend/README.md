# Expense Tracker — Frontend

A modern React frontend for the Expense Tracker application, built with Vite, Tailwind CSS, and reusable dashboard components for managing transactions, wallets, analytics, and user authentication.

## Project overview

This frontend is the user-facing portion of a multi-tenant expense tracking system. It connects with a Node.js/Express backend API to provide:

- secure authentication and authorization
- wallet and transaction management
- analytics dashboards with charts and spending summaries
- responsive UI with form validation and navigation guards

## Frontend tech stack

- React 19
- Vite 4+ for fast development and optimized production builds
- Tailwind CSS 4 for utility-first styling
- React Router DOM 7 for client-side routing
- Axios for API requests
- Recharts for chart visualizations
- Socket.IO client for real-time updates
- ESLint with React hooks rules for code quality

## Backend compatibility

The frontend is designed to work with the companion backend API in the repository root at `../backend`.

Backend stack includes:

- Node.js 18+
- Express.js
- MongoDB with Mongoose
- JWT authentication
- bcryptjs for password hashing
- Helmet, CORS, rate limiting, and input sanitization
- Winston logging with daily rotation
- Cron jobs for recurring task processing

## Folder structure

- `src/` — application source code
- `src/components/` — UI components and layout elements
- `src/context/` — React context providers for auth and wallet state
- `src/hooks/` — custom hooks used by pages and components
- `src/lib/` — API helpers and utility functions
- `src/pages/` — route components for dashboard, authentication, analytics, settings, and wallets

## Installation

### Prerequisites

- Node.js 18 or newer
- npm 10 or newer
- backend API running and configured

### Setup frontend

```bash
cd "/Users/aakash/Expense tracker/Expense-tracker/frontend"
npm install
```

### Start development server

```bash
npm run dev
```

### Build for production

```bash
npm run build
```

### Preview production build

```bash
npm run preview
```

### Run lint checks

```bash
npm run lint
```

## Environment

The frontend expects the backend API base URL to be configured in the application code or environment integration. Update the relevant API client settings in `src/lib/api.js` if needed.

## Contribution and workflow

- Create a feature branch for each improvement
- Keep commits focused and descriptive
- Run `npm run lint` before submitting changes
- Test UI flows locally with the backend API running

## Notes

This frontend is intentionally structured for robust development and maintainability. It uses modern React conventions and a modular component architecture to simplify future enhancements.

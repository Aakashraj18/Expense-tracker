# Expense Tracker

A full-stack multi-tenant expense tracking system with a modern React/Tailwind frontend and a secure Node.js/Express backend.

## Repository overview

This repo is organized as a monorepo with separate frontend and backend applications:

- `frontend/` — React application built with Vite, Tailwind CSS, and Recharts for analytics
- `backend/` — Express API with MongoDB, JWT authentication, tenant isolation, and scheduled recurring jobs

## Key features

- Multi-tenant wallet and transaction management
- Secure user registration and login with JWT authentication
- Gmail-only email validation across frontend and backend
- Real-time updates using Socket.IO
- Expense analytics and charts
- Role-based access control for wallets and members
- Production-ready backend middleware for security, logging, and rate limiting

## Live Link
- https://expense-tracker-six-sage-47.vercel.app

## Tech stack

### Frontend

- React 19
- Vite 4
- Tailwind CSS 4
- React Router DOM 7
- Axios
- Recharts
- Socket.IO client

### Backend

- Node.js 18+
- Express.js
- MongoDB with Mongoose
- JWT authentication
- bcryptjs password hashing
- Helmet, CORS, rate limiting, and input sanitization
- winston logging and daily rotation
- node-cron for scheduled tasks

## Setup

### Prerequisites

- Node.js 18 or newer
- npm 10 or newer
- MongoDB connection string

### Backend setup

```bash
cd "/Users/aakash/Expense tracker/Expense-tracker/backend"
npm install
```

Create a `.env` file in `backend/` with the required environment variables, such as:

```env
PORT=4000
MONGO_URI=your_mongo_connection_string
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d
```

Start the backend server:

```bash
npm run dev
```

### Frontend setup

```bash
cd "/Users/aakash/Expense tracker/Expense-tracker/frontend"
npm install
npm run dev
```

## Project structure

- `backend/src/controllers/` — request handlers for auth, wallets, transactions, and reports
- `backend/src/models/` — Mongoose schemas and models
- `backend/src/middleware/` — auth, tenant, and error handling middleware
- `backend/src/routes/` — API route definitions
- `frontend/src/components/` — reusable components and layout pieces
- `frontend/src/pages/` — page-level route components
- `frontend/src/context/` — React context providers for authentication and wallet state

## Deployment

1. Build and deploy `backend/` to a Node.js hosting environment.
2. Build and deploy `frontend/` as a static site bundle.
3. Configure the frontend to use the backend API URL.

## Notes

- Keep backend secrets secure and never commit `.env` files.
- Use the monorepo structure to develop frontend and backend together.
- Keep commit messages descriptive and use signed commits for verification.

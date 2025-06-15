# Feedbax - Notion-Powered Feedback & Roadmap System

## Overview

Feedbax is a modern feedback and roadmap system built with Next.js and Notion, designed to help teams collect, manage, and respond to user feedback effectively. It provides a Featurebase-style interface while leveraging Notion as the backend database.

## Architecture

### Frontend (Next.js)

- Built with Next.js 15+ using App Router
- TypeScript for type safety
- Shadcn UI + Tailwind CSS for components and styling
- React Server Components (RSC) by default
- Client components only where necessary (interactivity)

### Backend (Notion)

- Notion as the primary database
- Notion API for data operations
- Webhooks for real-time updates
- Native Notion comments for discussions

### Authentication

- Lightweight SSO via cookies
- User info passed from main app
- No separate login required

## Core Features

### Feedback Management

- Submit new feedback items
- Upvote existing items
- Comment on feedback
- Categorize feedback (Feature, Bug, etc.)
- Tag system for organization

### Roadmap

- Public roadmap view
- Status tracking (Planned, In Progress, Completed)
- Filtering and sorting options
- Visual progress indicators

### Admin Features

- Direct Notion integration for management
- Merge duplicate requests
- Update status and categories
- Respond to feedback via Notion comments
- Tag and organize items

### User Experience

- Clean, modern interface
- Mobile-first responsive design
- Real-time updates via webhooks
- Optimistic UI updates
- Accessible components

## Technical Specifications

### Data Structure (Notion)

- Feedback Database
  - Title (title property)
  - Description (rich text)
  - Type/Category (select)
  - Status (select)
  - Votes (number)
  - Submitter (text)
  - Tags (multi-select)
  - Merged Into (relation)

### API Routes

- `/api/notion-webhook` - Handle Notion webhooks

### Performance Considerations

- Server Components by default
- Minimal client-side JavaScript
- Efficient data fetching
- Proper caching strategies
- Rate limit handling

### Security

- Secure cookie handling
- API route protection
- Input validation
- Rate limiting
- Webhook verification

## Development Guidelines

### Code Style

- TypeScript for all code
- Functional programming patterns
- Descriptive variable names
- Proper error handling
- Comprehensive documentation

### Testing

- Unit tests for utilities
- Integration tests for components
- E2E tests for critical flows
- Proper mocking strategies

### Deployment

- Cloudflare Pages deployment
- Wrangler for configuration
- Environment variable management
- CI/CD pipeline
- Performance monitoring

## Future Considerations

- Analytics integration
- Email notifications
- Advanced filtering
- Custom themes
- API documentation
- Multi-language support

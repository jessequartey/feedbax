# 🤝 Contributing to Feedbax

Thank you for your interest in contributing to Feedbax! We welcome contributions from developers of all skill levels. This guide will help you get started with contributing to our open-source feedback and roadmap system.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Contributing Guidelines](#contributing-guidelines)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Documentation](#documentation)

## 📜 Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md). Please read it before contributing.

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+ and npm/yarn/pnpm
- **Git** for version control
- **Notion account** (for full functionality)
- Basic knowledge of **Next.js**, **TypeScript**, and **React**

### Development Setup

1. **Fork and Clone**
   ```bash
   git clone https://github.com/yourusername/feedbax.git
   cd feedbax
   ```

2. **Install Dependencies**
   ```bash
   pnpm install
   # or npm install / yarn install
   ```

3. **Environment Setup**
   ```bash
   cp .env.example .env.local
   ```
   
   Fill in your environment variables:
   ```env
   # Required for production
   NOTION_API_KEY=your_notion_integration_token
   NOTION_DATABASE_ID=your_notion_database_id
   
   # Optional
   NOTION_WEBHOOK_SECRET=your_webhook_secret
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

4. **Start Development Server**
   ```bash
   pnpm dev
   ```

5. **Open in Browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 🏗️ Project Structure

```
feedbax/
├── src/
│   ├── app/                    # Next.js App Router pages
│   ├── components/             # React components
│   │   ├── feedback/          # Feedback-specific components
│   │   └── ui/                # Reusable UI components
│   ├── lib/                   # Utilities and business logic
│   │   ├── dal/               # Data Access Layer
│   │   ├── services/          # Business logic services
│   │   ├── config/            # Configuration management
│   │   └── utils/             # Utility functions
│   ├── types/                 # TypeScript type definitions
│   └── content/               # Static content and mock data
├── public/                    # Static assets
├── docs/                      # Documentation
└── tests/                     # Test files
```

### Key Architectural Principles

- **Clean Architecture**: Separation of concerns between UI, business logic, and data access
- **Type Safety**: Comprehensive TypeScript coverage
- **Component Composition**: Reusable, composable React components
- **Performance**: Optimized for speed with proper caching and lazy loading
- **Accessibility**: WCAG 2.1 AA compliant components

## 🤝 Contributing Guidelines

### Types of Contributions

We welcome various types of contributions:

- 🐛 **Bug fixes**
- ✨ **New features**
- 📚 **Documentation improvements**
- 🧪 **Tests**
- 🎨 **UI/UX improvements**
- ⚡ **Performance optimizations**
- 🔧 **Tooling and infrastructure**

### Before You Start

1. **Check existing issues** to avoid duplicate work
2. **Create an issue** for new features or significant changes
3. **Discuss your approach** in the issue before starting work
4. **Keep changes focused** - one feature/fix per PR

### Development Workflow

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```

2. **Make your changes** following our coding standards

3. **Test your changes** thoroughly

4. **Commit your changes** with clear, descriptive messages:
   ```bash
   git commit -m "feat: add user authentication system"
   git commit -m "fix: resolve voting button accessibility issue"
   git commit -m "docs: update API documentation"
   ```

5. **Push to your fork** and create a pull request

## 🔄 Pull Request Process

### PR Requirements

- [ ] **Clear description** of changes and motivation
- [ ] **Tests** for new functionality
- [ ] **Documentation** updates if needed
- [ ] **No breaking changes** without discussion
- [ ] **Follows coding standards**
- [ ] **Passes all CI checks**

### PR Template

When creating a PR, please include:

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Other (please describe)

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing completed

## Screenshots (if applicable)
Add screenshots for UI changes

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] Tests pass locally
```

### Review Process

1. **Automated checks** must pass (linting, tests, build)
2. **Code review** by maintainers
3. **Testing** in development environment
4. **Approval** and merge

## 📝 Coding Standards

### TypeScript

- **Strict mode** enabled
- **Explicit types** for function parameters and returns
- **Interface over type** for object definitions
- **Proper JSDoc** comments for public APIs

```typescript
/**
 * Create a new feedback post
 * @param request - The feedback creation request
 * @returns Promise resolving to the created post
 */
async function createFeedbackPost(
  request: CreateFeedbackRequest
): Promise<ApiResponse<FeedbackPost>> {
  // Implementation
}
```

### React Components

- **Functional components** with hooks
- **TypeScript interfaces** for props
- **Proper error boundaries**
- **Accessibility attributes**

```tsx
interface PostCardProps {
  post: FeedbackPost;
  onClick: () => void;
  onUpvote?: (postId: string) => void;
}

export function PostCard({ post, onClick, onUpvote }: PostCardProps) {
  // Component implementation
}
```

### File Naming

- **kebab-case** for files and directories
- **PascalCase** for React components
- **camelCase** for functions and variables
- **SCREAMING_SNAKE_CASE** for constants

### Import Organization

```typescript
// 1. Node modules
import { useState, useCallback } from "react";
import { NextRequest } from "next/server";

// 2. Internal modules (absolute imports)
import { Button } from "@/components/ui/button";
import type { FeedbackPost } from "@/types/feedback";

// 3. Relative imports
import { PostCard } from "./post-card";
```

## 🧪 Testing

### Testing Strategy

- **Unit tests** for utilities and services
- **Component tests** for React components
- **Integration tests** for API routes
- **E2E tests** for critical user flows

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage

# Run E2E tests
pnpm test:e2e
```

### Writing Tests

```typescript
// Example unit test
describe('FeedbackService', () => {
  it('should create a feedback post', async () => {
    const service = new FeedbackService(mockRepository);
    const request = createMockRequest();
    
    const result = await service.createFeedbackPost(request);
    
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });
});
```

## 📚 Documentation

### Documentation Standards

- **Clear, concise** explanations
- **Code examples** for complex features
- **API documentation** for all public interfaces
- **Architecture decisions** documented in ADRs

### Documentation Types

- **README.md** - Project overview and setup
- **API docs** - Generated from TypeScript interfaces
- **Component docs** - Storybook stories
- **Architecture docs** - High-level system design

## 🎯 Areas for Contribution

### High Priority

- **Notion API integration** - Complete the Notion backend
- **Authentication system** - User management and permissions
- **Real-time updates** - WebSocket/SSE implementation
- **Testing infrastructure** - Comprehensive test suite

### Medium Priority

- **Performance optimization** - Caching and lazy loading
- **Accessibility improvements** - Enhanced a11y features
- **Mobile experience** - PWA capabilities
- **Analytics dashboard** - Usage insights and metrics

### Good First Issues

Look for issues labeled `good first issue` or `help wanted` for beginner-friendly contributions.

## 🆘 Getting Help

- **GitHub Issues** - For bugs and feature requests
- **GitHub Discussions** - For questions and general discussion
- **Discord** - Real-time chat with the community
- **Email** - Reach out to maintainers directly

## 🙏 Recognition

Contributors will be recognized in:

- **README.md** contributors section
- **Release notes** for significant contributions
- **GitHub contributors** page
- **Special mentions** in project updates

Thank you for contributing to Feedbax! 🚀

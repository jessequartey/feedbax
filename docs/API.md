# 📡 Feedbax API Documentation

This document provides comprehensive documentation for the Feedbax API endpoints, data structures, and integration patterns.

## 📋 Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Base URL](#base-url)
- [Response Format](#response-format)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)
- [Endpoints](#endpoints)
- [Webhooks](#webhooks)
- [SDKs](#sdks)

## 🔍 Overview

The Feedbax API is a RESTful API that allows you to:

- Manage feedback posts (create, read, update, delete)
- Handle user voting and comments
- Access roadmap and changelog data
- Integrate with external systems
- Receive real-time updates via webhooks

## 🔐 Authentication

### API Key Authentication

For server-to-server communication:

```http
Authorization: Bearer YOUR_API_KEY
```

### Session-based Authentication

For web applications:

```http
Cookie: session=YOUR_SESSION_TOKEN
```

### Public Endpoints

Some endpoints are publicly accessible without authentication:
- `GET /api/feedback` - List public feedback
- `GET /api/roadmap` - Public roadmap data
- `GET /api/changelog` - Changelog entries

## 🌐 Base URL

```
Production: https://your-domain.com/api
Development: http://localhost:3000/api
```

## 📦 Response Format

### Success Response

```json
{
  "success": true,
  "data": {
    // Response data
  },
  "message": "Optional success message"
}
```

### Paginated Response

```json
{
  "data": [
    // Array of items
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "totalPages": 10,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "Human-readable error message",
  "details": {
    // Additional error details
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## ⚠️ Error Handling

### HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `429` - Rate Limit Exceeded
- `500` - Internal Server Error

### Error Codes

- `VALIDATION_ERROR` - Request validation failed
- `NOT_FOUND` - Resource not found
- `UNAUTHORIZED` - Authentication required
- `FORBIDDEN` - Insufficient permissions
- `RATE_LIMIT_EXCEEDED` - Too many requests
- `NOTION_API_ERROR` - Notion integration error

## 🚦 Rate Limiting

- **Development**: 1000 requests per minute
- **Production**: 100 requests per 15 minutes
- **Burst**: Up to 10 requests per second

Rate limit headers:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642248600
```

## 🛠️ Endpoints

### Feedback Posts

#### List Feedback Posts

```http
GET /api/feedback
```

**Query Parameters:**
- `page` (number) - Page number (default: 1)
- `limit` (number) - Items per page (default: 10, max: 100)
- `type` (string) - Filter by type: `feature`, `bug`, `improvement`, `question`
- `status` (string) - Filter by status: `backlog`, `next-up`, `in-progress`, `under-review`, `done`
- `search` (string) - Search in title and description
- `tags` (string) - Comma-separated tags
- `sort` (string) - Sort field: `created`, `updated`, `upvotes`, `comments`
- `order` (string) - Sort order: `asc`, `desc`

**Example Request:**
```http
GET /api/feedback?type=feature&status=in-progress&limit=20&sort=upvotes&order=desc
```

**Example Response:**
```json
{
  "data": [
    {
      "id": "1",
      "title": "Add dark mode support",
      "description": "Users want a dark theme option",
      "type": "feature",
      "status": "in-progress",
      "upvotes": 42,
      "comments": 8,
      "author": "John Doe",
      "avatar": "https://example.com/avatar.jpg",
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-16T14:20:00Z",
      "tags": ["ui", "accessibility"]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false
  }
}
```

#### Get Feedback Post

```http
GET /api/feedback/{id}
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "id": "1",
    "title": "Add dark mode support",
    "description": "Users want a dark theme option",
    "type": "feature",
    "status": "in-progress",
    "upvotes": 42,
    "comments": 8,
    "author": "John Doe",
    "avatar": "https://example.com/avatar.jpg",
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-16T14:20:00Z",
    "tags": ["ui", "accessibility"]
  }
}
```

#### Create Feedback Post

```http
POST /api/feedback
```

**Request Body:**
```json
{
  "title": "Add dark mode support",
  "description": "Users want a dark theme option for better accessibility",
  "type": "feature",
  "tags": ["ui", "accessibility"],
  "authorName": "John Doe",
  "authorAvatar": "https://example.com/avatar.jpg"
}
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "id": "123",
    "title": "Add dark mode support",
    "description": "Users want a dark theme option for better accessibility",
    "type": "feature",
    "status": "backlog",
    "upvotes": 0,
    "comments": 0,
    "author": "John Doe",
    "avatar": "https://example.com/avatar.jpg",
    "createdAt": "2024-01-15T10:30:00Z",
    "tags": ["ui", "accessibility"]
  }
}
```

#### Update Feedback Post

```http
PATCH /api/feedback/{id}
```

**Request Body:**
```json
{
  "title": "Updated title",
  "status": "in-progress",
  "tags": ["ui", "accessibility", "theme"]
}
```

#### Delete Feedback Post

```http
DELETE /api/feedback/{id}
```

### Comments

#### Get Comments

```http
GET /api/feedback/{postId}/comments
```

#### Create Comment

```http
POST /api/feedback/{postId}/comments
```

**Request Body:**
```json
{
  "content": "Great idea! I'd love to see this implemented.",
  "parentId": "456", // Optional, for nested comments
  "authorName": "Jane Smith",
  "authorAvatar": "https://example.com/jane-avatar.jpg"
}
```

### Voting

#### Vote on Post

```http
POST /api/feedback/{postId}/vote
```

**Request Body:**
```json
{
  "type": "upvote", // or "downvote"
  "userId": "user123"
}
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "upvotes": 43,
    "userVote": "upvote"
  }
}
```

#### Get User Vote

```http
GET /api/feedback/{postId}/vote?userId=user123
```

### Roadmap

#### Get Roadmap Data

```http
GET /api/roadmap
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "columns": [
      {
        "id": "backlog",
        "title": "Backlog",
        "status": "backlog",
        "order": 1,
        "posts": [
          // Array of feedback posts
        ]
      }
    ],
    "totalPosts": 25,
    "lastUpdated": "2024-01-15T10:30:00Z"
  }
}
```

### Analytics

#### Get Post Statistics

```http
GET /api/analytics/posts
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "total": 100,
    "byType": {
      "feature": 60,
      "bug": 30,
      "improvement": 10
    },
    "byStatus": {
      "backlog": 40,
      "in-progress": 20,
      "done": 40
    }
  }
}
```

## 🔗 Webhooks

### Webhook Events

Feedbax can send webhooks for the following events:

- `feedback.created` - New feedback post created
- `feedback.updated` - Feedback post updated
- `feedback.deleted` - Feedback post deleted
- `comment.created` - New comment added
- `vote.created` - New vote cast

### Webhook Payload

```json
{
  "event": "feedback.created",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    // Event-specific data
  }
}
```

### Webhook Security

Webhooks are signed with HMAC-SHA256. Verify the signature using the `X-Webhook-Signature` header.

## 📚 SDKs

### JavaScript/TypeScript

```bash
npm install @feedbax/sdk
```

```typescript
import { FeedbackClient } from '@feedbax/sdk';

const client = new FeedbackClient({
  apiKey: 'your-api-key',
  baseUrl: 'https://your-domain.com/api'
});

// Create feedback
const feedback = await client.feedback.create({
  title: 'New feature request',
  type: 'feature',
  authorName: 'John Doe'
});
```

### Python

```bash
pip install feedbax-python
```

```python
from feedbax import FeedbackClient

client = FeedbackClient(
    api_key='your-api-key',
    base_url='https://your-domain.com/api'
)

# Create feedback
feedback = client.feedback.create(
    title='New feature request',
    type='feature',
    author_name='John Doe'
)
```

## 🔧 Integration Examples

### React Hook

```typescript
import { useFeedback } from '@feedbax/react';

function FeedbackList() {
  const { data, loading, error } = useFeedback({
    type: 'feature',
    status: 'in-progress'
  });

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      {data.map(post => (
        <div key={post.id}>{post.title}</div>
      ))}
    </div>
  );
}
```

### Webhook Handler (Next.js)

```typescript
import { NextRequest } from 'next/server';
import { verifyWebhookSignature } from '@feedbax/sdk';

export async function POST(request: NextRequest) {
  const signature = request.headers.get('x-webhook-signature');
  const payload = await request.text();

  if (!verifyWebhookSignature(payload, signature, process.env.WEBHOOK_SECRET)) {
    return new Response('Invalid signature', { status: 401 });
  }

  const event = JSON.parse(payload);
  
  switch (event.event) {
    case 'feedback.created':
      // Handle new feedback
      break;
    case 'feedback.updated':
      // Handle feedback update
      break;
  }

  return new Response('OK');
}
```

## 📞 Support

For API support and questions:

- **Documentation**: [docs.feedbax.com](https://docs.feedbax.com)
- **GitHub Issues**: [github.com/feedbax/feedbax/issues](https://github.com/feedbax/feedbax/issues)
- **Discord**: [discord.gg/feedbax](https://discord.gg/feedbax)
- **Email**: api-support@feedbax.com

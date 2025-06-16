import { FeedbackPost } from "@/types/feedback";

export const feedbackPosts: FeedbackPost[] = [
  {
    id: "1",
    title: "Notion API Integration",
    description:
      "Set up Notion API client and configuration for database operations, including proper error handling for API rate limits and webhook implementation for real-time updates.",
    type: "feature",
    status: "in-progress",
    upvotes: 42,
    comments: 8,
    author: "Jesse Quartey",
    avatar:
      "https://pbs.twimg.com/profile_images/1930234776822190080/5oYIe4uz_400x400.jpg",
    createdAt: "2 days ago",
    tags: ["backend", "notion", "api"],
  },
  {
    id: "2",
    title: "Authentication System",
    description:
      "Implement SSO cookie handling, user context provider, and secure token verification for user identification and vote tracking.",
    type: "feature",
    status: "next-up",
    upvotes: 38,
    comments: 5,
    author: "Jesse Quartey",
    avatar:
      "https://pbs.twimg.com/profile_images/1930234776822190080/5oYIe4uz_400x400.jpg",
    createdAt: "2 days ago",
    tags: ["auth", "security"],
  },
  {
    id: "3",
    title: "API Routes Implementation",
    description:
      "Create feedback submission endpoint, implement voting system, add comment functionality, and set up webhook handler with proper error handling.",
    type: "feature",
    status: "next-up",
    upvotes: 35,
    comments: 6,
    author: "Jesse Quartey",
    avatar:
      "https://pbs.twimg.com/profile_images/1930234776822190080/5oYIe4uz_400x400.jpg",
    createdAt: "2 days ago",
    tags: ["api", "backend"],
  },
  {
    id: "4",
    title: "Data Management System",
    description:
      "Implement optimistic updates, proper caching strategies, revalidation triggers, and data transformation utilities for efficient data handling.",
    type: "feature",
    status: "next-up",
    upvotes: 29,
    comments: 4,
    author: "Jesse Quartey",
    avatar:
      "https://pbs.twimg.com/profile_images/1930234776822190080/5oYIe4uz_400x400.jpg",
    createdAt: "2 days ago",
    tags: ["data", "performance"],
  },
  {
    id: "5",
    title: "UI Design Implementation",
    description:
      "Complete the implementation of the feedback board, roadmap, and changelog pages with modern UI components and responsive design.",
    type: "feature",
    status: "done",
    upvotes: 45,
    comments: 12,
    author: "Jesse Quartey",
    avatar:
      "https://pbs.twimg.com/profile_images/1930234776822190080/5oYIe4uz_400x400.jpg",
    createdAt: "1 day ago",
    tags: ["ui", "frontend"],
  },
  {
    id: "6",
    title: "Performance Optimization",
    description:
      "Implement proper loading states, skeleton loaders, image optimization, error boundaries, and caching headers for better performance.",
    type: "feature",
    status: "backlog",
    upvotes: 27,
    comments: 3,
    author: "Jesse Quartey",
    avatar:
      "https://pbs.twimg.com/profile_images/1930234776822190080/5oYIe4uz_400x400.jpg",
    createdAt: "2 days ago",
    tags: ["performance", "optimization"],
  },
  {
    id: "7",
    title: "Testing Infrastructure",
    description:
      "Set up testing environment, add unit tests for utilities, create integration tests for components, and implement E2E tests for critical flows.",
    type: "feature",
    status: "backlog",
    upvotes: 24,
    comments: 2,
    author: "Jesse Quartey",
    avatar:
      "https://pbs.twimg.com/profile_images/1930234776822190080/5oYIe4uz_400x400.jpg",
    createdAt: "2 days ago",
    tags: ["testing", "quality"],
  },
  {
    id: "8",
    title: "Documentation System",
    description:
      "Create comprehensive API documentation, setup guide, Notion integration docs, component documentation, and deployment guide.",
    type: "feature",
    status: "backlog",
    upvotes: 19,
    comments: 1,
    author: "Jesse Quartey",
    avatar:
      "https://pbs.twimg.com/profile_images/1930234776822190080/5oYIe4uz_400x400.jpg",
    createdAt: "2 days ago",
    tags: ["documentation"],
  },
];

export const roadmapItems = {
  backlog: feedbackPosts.filter((post) => post.status === "backlog"),
  "next-up": feedbackPosts.filter((post) => post.status === "next-up"),
  "in-progress": feedbackPosts.filter((post) => post.status === "in-progress"),
  "under-review": feedbackPosts.filter(
    (post) => post.status === "under-review"
  ),
  done: feedbackPosts.filter((post) => post.status === "done"),
};

export const changelogItems = [
  {
    version: "0.0.1",
    date: "2024-03-20",
    changes: [
      {
        type: "feature",
        description:
          "Initial UI implementation for feedback board, roadmap, and changelog pages",
      },
    ],
  },
];

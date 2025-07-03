/**
 * App Configuration
 * 
 * This file contains all app-specific text, branding, and configuration
 * that can be easily customized when cloning/forking the project.
 */

export const appConfig = {
  // App Identity
  name: "Sylax",
  tagline: "AI-Powered Learning Platform",
  description: "An AI-powered learning platform that helps students learn faster and more effectively.",
  authCookieKey: "sylax_user",

  // URLs
  urls: {
    app: "https://sylax.app",
    github: "https://github.com/jessequartey/feedbax",
    documentation: "/docs",
  },

  // Branding
  branding: {
    logo: "🧠", // Can be emoji or icon name
    colors: {
      primary: "purple", // Used for accent colors
      secondary: "indigo",
    },
    beta: true, // Show beta badge
  },

  // SEO & Metadata
  seo: {
    title: "Sylax – AI-Powered Learning Platform",
    description: "Submit feedback, feature requests, and bug reports for Sylax, an AI-powered learning platform.",
    keywords: [
      "learning",
      "AI",
      "education",
      "feedback",
      "platform",
      "students",
      "tutoring",
      "personalized learning",
      "study groups",
      "collaborative learning",
    ] as string[],
    author: "Sylax Team",
    creator: "Sylax",
    publisher: "Sylax",
    siteName: "Sylax",
    twitterHandle: "@sylaxapp",
    ogImage: "/sylax-opengraph.jpg",
  },

  // Navigation
  navigation: {
    backToApp: {
      text: "Back to Sylax",
      url: "https://sylax.app",
    },
    sections: {
      feedback: {
        title: "Feedback",
        description: "Share your ideas and help us improve",
      },
      roadmap: {
        title: "Roadmap", 
        description: "See what we're working on",
      },
      changelog: {
        title: "Changelog",
        description: "Track our latest updates",
      },
    },
  },

  // Welcome Messages
  welcome: {
    feedback: {
      title: "Help us improve Sylax",
      subtitle: "An AI-powered learning platform. Share your ideas, report bugs, and help shape the future of education!",
      guidelines: [
        "Search before posting! Your feedback might already exist.",
        "Create separate requests for multiple features.",
        "Select \"Bug Report\" when reporting bugs.",
      ],
    },
    changelog: {
      title: "Changelog - Stay updated with Sylax improvements! 📋",
      subtitle: [
        "Track all the latest updates, new features, and bug fixes.",
        "We're constantly improving Sylax based on your feedback!",
      ],
    },
    roadmap: {
      title: "Roadmap - See what's coming next! 🗺️",
      subtitle: [
        "Explore our development priorities and upcoming features.",
        "Vote on features you'd like to see and track their progress.",
      ],
    },
  },

  // Post Creation
  postCreation: {
    placeholder: {
      title: "Title of your post",
      description: `
1. Search before posting! Your feedback has likely been submitted already
2. If you have multiple items to request, please create separate posts for each.
3. If submitting a bug, please include steps to reproduce and expected behavior`,
    },
    submitButton: "Submit Post",
    successMessage: "Post created successfully! 🎉",
    errorMessage: "Failed to create post. Please try again.",
  },

  // Authentication
  auth: {
    welcomeTitle: "Welcome to Sylax",
    welcomeSubtitle: "Please provide your details to continue",
    signInPrompt: "Please sign in to create a post",
  },

  // Footer
  footer: {
    poweredBy: "Powered by Feedbax",
    githubLink: "https://github.com/jessequartey/feedbax",
  },

  // Features
  features: {
    voting: true,
    comments: true,
    subscriptions: true,
    changelog: true,
    roadmap: true,
  },

  // Categories/Types
  postTypes: {
    feature: {
      label: "Feature Request",
      icon: "lightbulb",
      color: "blue",
    },
    bug: {
      label: "Bug Report", 
      icon: "bug",
      color: "red",
    },
    improvement: {
      label: "Improvement",
      icon: "trending-up", 
      color: "green",
    },
  },

  // Status Configuration
  statuses: {
    backlog: {
      label: "Backlog",
      color: "gray",
      description: "Ideas we're considering",
    },
    "next-up": {
      label: "Next Up",
      color: "yellow",
      description: "Coming soon",
    },
    "in-progress": {
      label: "In Progress",
      color: "blue",
      description: "Currently working on",
    },
    "under-review": {
      label: "Under Review",
      color: "purple",
      description: "Being evaluated",
    },
    done: {
      label: "Done",
      color: "green", 
      description: "Completed",
    },
  },
} as const;



// Type exports for TypeScript
export type AppConfig = typeof appConfig;
export type PostType = keyof typeof appConfig.postTypes;
export type PostStatus = keyof typeof appConfig.statuses; 
"use client";

import { useState, useCallback, useMemo } from "react";
import {
  Search,
  SlidersHorizontal,
  GitBranch,
  Clock,
  Bell,
  Sparkles,
  Settings,
  TrendingUp,
} from "lucide-react";
import { FeedbackHeader } from "./header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import ReactMarkdown from "react-markdown";

/**
 * Changelog item interface
 * Represents a single changelog entry with metadata
 */
export interface ChangelogItem {
  id: string;
  date: string;
  content: string;
  tags?: string[];
  author: string;
  avatar?: string;
  version?: string;
  title: string;
  images?: string[];
  videos?: string[];
  comments?: number;
}

const mockChangelogData: ChangelogItem[] = [
  {
    id: "1",
    date: "2024-01-15",
    title: "Major AI Tutor Improvements & Mobile PWA Support",
    author: "Jesse Quartey",
    avatar: "https://pbs.twimg.com/profile_images/1930234776822190080/5oYIe4uz_400x400.jpg",
    version: "v2.1.0",
    content: `# 🚀 Major AI Tutor Improvements & Mobile PWA Support

The time has come. We're finally ready to introduce you to the **Syllax AI Enhancement Platform**!

The AI platform lets your students learn from anywhere with a unified learning experience and automate study sessions with powerful AI tutors. It's fast, modern, and built for collaboration.

## What's New
- **Enhanced AI Understanding**: Better context awareness for personalized learning
- **Mobile PWA Support**: Install Syllax on your mobile device for offline access
- **Performance Improvements**: 40% faster response times across the platform
- **Bug Fixes**: Resolved quiz saving issues and study timer problems

**Included in all of your plans** ✨

Cut the sky-high tutoring costs and expensive learning platform bills. Bring your education to Syllax and save thousands per semester.`,
    tags: ["New"],
    images: ["/placeholder.svg"],
    videos: [],
    comments: 5,
  },
  {
    id: "2",
    date: "2024-01-10",
    title: "Study Groups & Collaborative Learning",
    author: "Jesse Quartey",
    avatar: "https://pbs.twimg.com/profile_images/1930234776822190080/5oYIe4uz_400x400.jpg",
    version: "v2.0.0",
    content: `# 📚 Study Groups & Collaborative Learning

We're excited to introduce **Study Groups** - collaborative spaces where students can learn together!

## Key Features
- Create shared study spaces with classmates
- Real-time collaboration on assignments and projects  
- AI assistance that understands group context
- Track individual and group learning progress

Perfect for group projects, exam preparation, and peer learning sessions.

## Getting Started
1. Create a new study group from your dashboard
2. Invite classmates with a simple share code
3. Start collaborating with AI-powered assistance
4. Monitor everyone's learning journey together`,
    tags: ["New"],
    images: [],
    videos: [],
    comments: 3,
  },
  {
    id: "3",
    date: "2024-01-05",
    title: "UI Redesign & Accessibility Improvements",
    author: "Sarah Design",
    avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Sarah%20Design",
    version: "v1.9.0",
    content: `# 🎨 UI Redesign & Accessibility Improvements

We've completely refreshed Syllax with a focus on clarity and accessibility.

## Design Updates
- **Cleaner Interface**: Reduced visual clutter for better focus
- **Enhanced Dark Mode**: True dark theme that's comfortable for extended study sessions
- **Better Typography**: Improved readability with optimized font choices
- **Responsive Design**: Perfect experience across all devices

## Accessibility
- WCAG 2.1 AA compliant color contrast
- Full keyboard navigation support
- Enhanced screen reader compatibility
- Clear focus indicators throughout the interface

The new design maintains familiarity while providing a more polished experience.`,
    tags: ["Improved"],
    images: [],
    videos: [],
    comments: 7,
  },
  {
    id: "4",
    date: "2023-12-20",
    title: "Performance & Security Updates",
    author: "Dev Team",
    avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Dev%20Team",
    version: "v1.8.5",
    content: `# 🔧 Performance & Security Updates

This month we focused on performance optimizations and security enhancements.

## Performance Improvements
- 60% faster database query responses
- Improved content delivery speeds with enhanced caching
- 30% reduction in memory usage across the platform

## Security Updates
- Enhanced authentication security protocols
- Updated all dependencies to latest secure versions
- Improved data encryption for student information

## Bug Fixes
- Fixed login session timeout issues
- Resolved file upload problems for large documents
- Corrected timezone display issues in study schedules

Thank you for your patience and continued feedback!`,
    tags: ["Improved"],
    images: [],
    videos: [],
    comments: 2,
  },
  {
    id: "5",
    date: "2023-12-15",
    title: "Learning Analytics & Study Tools",
    author: "Jesse Quartey",
    avatar: "https://pbs.twimg.com/profile_images/1930234776822190080/5oYIe4uz_400x400.jpg",
    version: "v1.8.0",
    content: `# 📊 Learning Analytics & Study Tools

Introducing powerful new tools to help you study more effectively and track your progress.

## Learning Analytics
- **Progress Dashboard**: Visual overview of your learning journey
- **Time Tracking**: Monitor study time across different subjects
- **Performance Insights**: Identify strengths and improvement areas
- **Goal Setting**: Set and track personalized learning objectives

## New Study Tools
- **AI Flashcard Generator**: Create flashcards from your notes automatically
- **Practice Quizzes**: Auto-generated quizzes based on study materials
- **Citation Helper**: Automatic citation generation for research papers
- **Note Templates**: Pre-designed templates for different subjects

These tools are designed to help you study smarter, not harder.`,
    tags: ["New"],
    images: [],
    videos: [],
    comments: 8,
  },
];

/**
 * ChangelogBoard Component
 *
 * Displays a chronological list of changelog entries with search functionality.
 * Follows the same clean design patterns as other feedback pages.
 *
 * @returns JSX.Element The changelog board interface
 */
export function ChangelogBoard() {
  const [searchQuery, setSearchQuery] = useState("");

  // Memoized filtered entries for performance
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return mockChangelogData;

    return mockChangelogData.filter((entry) => {
      const searchLower = searchQuery.toLowerCase();
      return (
        entry.content.toLowerCase().includes(searchLower) ||
        entry.tags?.some((tag) => tag.toLowerCase().includes(searchLower))
      );
    });
  }, [searchQuery]);

  /**
   * Format date string for display
   * @param dateString - ISO date string
   * @returns Formatted date string (e.g., "January 15th, 2024")
   */
  const formatDate = useCallback((dateString: string): string => {
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.toLocaleDateString("en-US", { month: "long" });
    const year = date.getFullYear();

    const suffix =
      day > 3 && day < 21
        ? "th"
        : day % 10 === 1
        ? "st"
        : day % 10 === 2
        ? "nd"
        : day % 10 === 3
        ? "rd"
        : "th";

    return `${month} ${day}${suffix}, ${year}`;
  }, []);

  /**
   * Handle search input changes
   * @param value - The search query
   */
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);

  /**
   * Get appropriate icon for changelog entry tags
   * @param tags - Array of tags
   * @returns Appropriate icon component
   */
  const getEntryIcon = useCallback((tags?: string[]) => {
    if (tags?.includes("New")) {
      return <Sparkles className="h-5 w-5 text-primary" />;
    }
    if (tags?.includes("Improved")) {
      return <TrendingUp className="h-5 w-5 text-primary" />;
    }
    return <GitBranch className="h-5 w-5 text-primary" />;
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <FeedbackHeader />

      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
            {/* Welcome Section */}
            <div className="bg-gradient-to-r from-blue-900/20 to-indigo-900/20 border border-blue-500/20 rounded-lg p-6 mb-6">
              <h2 className="text-lg font-semibold text-foreground mb-2">
                Changelog - Stay updated with Syllax improvements! 📋
              </h2>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>
                  Track all the latest updates, new features, and bug fixes.
                </p>
                <p>
                  We&apos;re constantly improving Syllax based on your feedback!
                </p>
              </div>
            </div>

            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
              <div className="relative flex-1 max-w-md">
                <Search
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  placeholder="Search changelog..."
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-10"
                  aria-label="Search changelog entries"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0"
                    onClick={() => setSearchQuery("")}
                    aria-label="Clear search"
                  >
                    ×
                  </Button>
                )}
              </div>
              <div className="flex items-center space-x-3">
                <Button
                  className="bg-primary hover:bg-primary/90"
                  aria-label="Subscribe to changelog updates"
                >
                  <Bell className="h-4 w-4 mr-2" />
                  Subscribe to updates
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Filter changelog entries"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Results summary */}
            {searchQuery && (
              <div className="text-sm text-muted-foreground mb-4">
                {filteredEntries.length === 0 ? (
                  <span>No entries found for &quot;{searchQuery}&quot;</span>
                ) : (
                  <span>
                    {filteredEntries.length} entr
                    {filteredEntries.length !== 1 ? "ies" : "y"} found for
                    &quot;
                    {searchQuery}&quot;
                  </span>
                )}
              </div>
            )}

            {/* Changelog Entries */}
            <div className="space-y-6">
              {filteredEntries.length > 0 ? (
                filteredEntries.map((entry) => (
                  <Card key={entry.id} className="p-6">
                    {/* Entry Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                          {getEntryIcon(entry.tags)}
                        </div>
                        <div>
                          <div className="font-semibold text-foreground">
                            {formatDate(entry.date)}
                          </div>
                          <div className="flex items-center text-xs text-muted-foreground">
                            <Clock className="h-3 w-3 mr-1" />
                            Release
                          </div>
                        </div>
                      </div>
                      {entry.tags && (
                        <div className="flex gap-1 flex-wrap">
                          {entry.tags.map((tag) => (
                            <Badge
                              key={tag}
                              variant={tag === "New" ? "default" : "secondary"}
                              className="text-xs"
                            >
                              {tag === "New" && (
                                <Sparkles className="h-3 w-3 mr-1" />
                              )}
                              {tag === "Improved" && (
                                <Settings className="h-3 w-3 mr-1" />
                              )}
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Entry Content */}
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown
                        components={{
                          h1: ({ children }) => (
                            <h1 className="text-xl font-bold mb-4 text-foreground">
                              {children}
                            </h1>
                          ),
                          h2: ({ children }) => (
                            <h2 className="text-lg font-semibold mb-3 mt-6 text-foreground">
                              {children}
                            </h2>
                          ),
                          h3: ({ children }) => (
                            <h3 className="text-base font-semibold mb-2 mt-4 text-foreground">
                              {children}
                            </h3>
                          ),
                          p: ({ children }) => (
                            <p className="text-muted-foreground mb-3 leading-relaxed">
                              {children}
                            </p>
                          ),
                          ul: ({ children }) => (
                            <ul className="list-disc list-inside mb-4 text-muted-foreground space-y-1">
                              {children}
                            </ul>
                          ),
                          ol: ({ children }) => (
                            <ol className="list-decimal list-inside mb-4 text-muted-foreground space-y-1">
                              {children}
                            </ol>
                          ),
                          strong: ({ children }) => (
                            <strong className="font-semibold text-foreground">
                              {children}
                            </strong>
                          ),
                          code: ({ children }) => (
                            <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">
                              {children}
                            </code>
                          ),
                        }}
                      >
                        {entry.content}
                      </ReactMarkdown>
                    </div>
                  </Card>
                ))
              ) : (
                <Card className="p-12 text-center">
                  <div className="text-muted-foreground text-lg mb-2">
                    {searchQuery
                      ? "No entries found"
                      : "No changelog entries yet"}
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    {searchQuery
                      ? "Try adjusting your search terms or clear the search to see all entries."
                      : "Check back soon for updates!"}
                  </p>
                  {searchQuery && (
                    <Button
                      variant="outline"
                      onClick={() => setSearchQuery("")}
                    >
                      Clear search
                    </Button>
                  )}
                </Card>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="space-y-4">
              <Card className="p-4">
                <h3 className="font-semibold mb-3">Quick Stats</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      Total Updates
                    </span>
                    <span className="font-medium">
                      {mockChangelogData.length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      This Month
                    </span>
                    <span className="font-medium">3</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      New Features
                    </span>
                    <span className="font-medium">
                      {
                        mockChangelogData.filter((entry) =>
                          entry.tags?.includes("New")
                        ).length
                      }
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      Improvements
                    </span>
                    <span className="font-medium">
                      {
                        mockChangelogData.filter((entry) =>
                          entry.tags?.includes("Improved")
                        ).length
                      }
                    </span>
                  </div>
                </div>
              </Card>

              <Card className="p-4">
                <h3 className="font-semibold mb-3">Release Types</h3>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Badge variant="default" className="text-xs">
                      <Sparkles className="h-3 w-3 mr-1" />
                      New
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      New features and additions
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant="secondary" className="text-xs">
                      <Settings className="h-3 w-3 mr-1" />
                      Improved
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Enhancements and fixes
                    </span>
                  </div>
                </div>
              </Card>

              <Card className="p-4">
                <div className="text-xs text-muted-foreground text-center">
                  ⚡ Powered by{" "}
                  <a
                    href="https://github.com/jessequartey/feedbax"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-foreground transition-colors underline"
                  >
                    Feedbax
                  </a>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Sparkles,
  TrendingUp,
  GitBranch,
  Search,
  Calendar,
  User,
  MessageCircle,
  Tag,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FeedbackHeader } from "./header";
import { appConfig } from "@/config";

interface ChangelogItem {
  id: string;
  date: string;
  title: string;
  author: string;
  avatar: string;
  version: string;
  content: string;
  tags?: string[];
  images?: string[];
  videos?: string[];
  comments: number;
}

// Clean mock data - this should be replaced with actual data fetching
const mockChangelogData: ChangelogItem[] = [
  {
    id: "1",
    date: "2024-01-15",
    title: "Welcome to Sylax Feedback",
    author: "Sylax Team",
    avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Sylax%20Team",
    version: "v1.0.0",
    content: `# 🎉 Welcome to Sylax Feedback!

We're excited to launch our feedback platform to help shape the future of AI-powered learning.

## What's New
- **Feedback System**: Share your ideas and feature requests
- **Roadmap Visibility**: See what we're working on next
- **Community Driven**: Help us build the best learning platform together

Share your thoughts and help us make Sylax even better!`,
    tags: ["New"],
    images: [],
    videos: [],
    comments: 0,
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
        entry.title.toLowerCase().includes(searchLower) ||
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
            <div className="bg-gradient-to-r from-purple-900/20 to-indigo-900/20 border border-purple-500/20 rounded-lg p-6 mb-6">
              <h2 className="text-lg font-semibold text-foreground mb-2">
                {appConfig.welcome.changelog.title}
              </h2>
              <div className="text-sm text-muted-foreground space-y-1">
                {appConfig.welcome.changelog.subtitle.map((line, index) => (
                  <p key={index}>{line}</p>
                ))}
              </div>
            </div>

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  {appConfig.navigation.sections.changelog.title}
                </h1>
                <p className="text-muted-foreground mt-1">
                  {appConfig.navigation.sections.changelog.description}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search updates..."
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="pl-10 w-full sm:w-64"
                  />
                </div>
              </div>
            </div>

            {/* Results Count */}
            <div className="flex items-center justify-between mb-6">
              <p className="text-sm text-muted-foreground">
                {filteredEntries.length === mockChangelogData.length
                  ? `${filteredEntries.length} updates`
                  : `${filteredEntries.length} of ${mockChangelogData.length} updates`}
              </p>
            </div>

            {/* Changelog Entries */}
            <div className="space-y-6">
              {filteredEntries.length === 0 ? (
                <Card className="p-8 text-center">
                  <div className="text-muted-foreground">
                    <GitBranch className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <h3 className="text-lg font-medium mb-2">No updates found</h3>
                    <p className="text-sm">
                      Try adjusting your search query or check back later for new updates.
                    </p>
                  </div>
                </Card>
              ) : (
                filteredEntries.map((entry) => (
                  <Card key={entry.id} className="overflow-hidden">
                    <CardHeader className="pb-3">
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={entry.avatar} alt={entry.author} />
                            <AvatarFallback>
                              {entry.author.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {getEntryIcon(entry.tags)}
                            <h3 className="text-lg font-semibold text-foreground truncate">
                              {entry.title}
                            </h3>
                          </div>

                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <User className="h-4 w-4" />
                              <span>{entry.author}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              <span>{formatDate(entry.date)}</span>
                            </div>
                            <Badge variant="outline" className="text-xs">
                              {entry.version}
                            </Badge>
                            {entry.tags && entry.tags.length > 0 && (
                              <div className="flex items-center gap-1">
                                <Tag className="h-4 w-4" />
                                <div className="flex gap-1">
                                  {entry.tags.map((tag) => (
                                    <Badge
                                      key={tag}
                                      variant="secondary"
                                      className="text-xs"
                                    >
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent>
                      <div className="prose prose-sm max-w-none dark:prose-invert">
                        <div
                          className="text-sm text-muted-foreground leading-relaxed"
                          dangerouslySetInnerHTML={{
                            __html: entry.content
                              .replace(/^# /gm, "## ")
                              .replace(/\n/g, "<br />"),
                          }}
                        />
                      </div>

                      {entry.comments > 0 && (
                        <div className="mt-4 pt-4 border-t border-border">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <MessageCircle className="h-4 w-4 mr-2" />
                            {entry.comments} comments
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <Card className="sticky top-24">
              <CardHeader>
                <h3 className="text-lg font-semibold">Latest Updates</h3>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="text-sm text-muted-foreground">
                    <p>
                      Stay up to date with the latest changes and improvements to {appConfig.name}.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
                      <span>New features and improvements</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <TrendingUp className="h-4 w-4 text-primary flex-shrink-0" />
                      <span>Performance optimizations</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <GitBranch className="h-4 w-4 text-primary flex-shrink-0" />
                      <span>Bug fixes and stability</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client"

import { useState, useEffect, useRef } from "react"
import { Search, Filter } from "lucide-react"
import { FeedbackHeader } from "./feedback-header"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import ReactMarkdown from "react-markdown"

export interface ChangelogItem {
  id: string
  date: string
  content: string
  tags?: string[]
}

const mockChangelogData: ChangelogItem[] = [
  {
    id: "1",
    date: "2024-01-15",
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
    tags: ["New", "Improved"],
  },
  {
    id: "2",
    date: "2024-01-10",
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
  },
  {
    id: "3",
    date: "2024-01-05",
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
  },
  {
    id: "4",
    date: "2023-12-20",
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
  },
  {
    id: "5",
    date: "2023-12-15",
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
  },
]

export function ChangelogBoard() {
  const [searchQuery, setSearchQuery] = useState("")
  const [activeDate, setActiveDate] = useState<string>("")
  const containerRef = useRef<HTMLDivElement>(null)
  const dateRefs = useRef<{ [key: string]: HTMLDivElement }>({})

  const filteredEntries = mockChangelogData.filter((entry) => {
    const matchesSearch = entry.content.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesSearch
  })

  // Handle sticky date behavior
  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current) return

      const container = containerRef.current
      const scrollTop = container.scrollTop
      const containerTop = container.getBoundingClientRect().top

      let currentDate = ""

      // Find which date section is currently visible
      Object.entries(dateRefs.current).forEach(([date, element]) => {
        if (element) {
          const elementTop = element.getBoundingClientRect().top - containerTop
          if (elementTop <= 100) {
            // 100px offset for sticky positioning
            currentDate = date
          }
        }
      })

      setActiveDate(currentDate)
    }

    const container = containerRef.current
    if (container) {
      container.addEventListener("scroll", handleScroll)
      handleScroll() // Initial call
      return () => container.removeEventListener("scroll", handleScroll)
    }
  }, [filteredEntries])

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  }

  const getDateSuffix = (day: number) => {
    if (day > 3 && day < 21) return "th"
    switch (day % 10) {
      case 1:
        return "st"
      case 2:
        return "nd"
      case 3:
        return "rd"
      default:
        return "th"
    }
  }

  const formatDateShort = (dateString: string) => {
    const date = new Date(dateString)
    const day = date.getDate()
    const month = date.toLocaleDateString("en-US", { month: "long" })
    const year = date.getFullYear()
    return `${month} ${day}${getDateSuffix(day)}, ${year}`
  }

  return (
    <div className="min-h-screen bg-background">
      <FeedbackHeader />

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Changelog</h1>
          <p className="text-lg text-muted-foreground mb-6">Follow new updates and improvements to Syllax.</p>
          <div className="flex items-center justify-center gap-4">
            <Button className="bg-primary hover:bg-primary/90">Subscribe to updates</Button>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search entries..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 w-64"
              />
            </div>
            <Button variant="outline" size="icon">
              <Filter className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex gap-8">
          {/* Sticky Date Sidebar */}
          <div className="w-48 flex-shrink-0">
            <div className="sticky top-8">
              {filteredEntries.map((entry) => (
                <div
                  key={entry.id}
                  className={`p-4 rounded-lg mb-2 transition-colors cursor-pointer ${
                    activeDate === entry.date
                      ? "bg-primary/10 text-primary border-l-2 border-primary"
                      : "text-muted-foreground hover:bg-muted/50"
                  }`}
                  onClick={() => {
                    const element = dateRefs.current[entry.date]
                    if (element) {
                      element.scrollIntoView({ behavior: "smooth", block: "start" })
                    }
                  }}
                >
                  <div className="font-medium text-sm">{formatDateShort(entry.date)}</div>
                  {entry.tags && (
                    <div className="flex gap-1 mt-2">
                      {entry.tags.map((tag) => (
                        <Badge key={tag} variant={tag === "New" ? "default" : "secondary"} className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Main Content */}
          <div ref={containerRef} className="flex-1 max-h-[calc(100vh-200px)] overflow-y-auto pr-4">
            <div className="space-y-16">
              {filteredEntries.map((entry) => (
                <div
                  key={entry.id}
                  ref={(el) => {
                    if (el) dateRefs.current[entry.date] = el
                  }}
                  className="scroll-mt-8"
                >
                  <div className="prose prose-lg dark:prose-invert max-w-none">
                    <ReactMarkdown
                      components={{
                        h1: ({ children }) => <h1 className="text-3xl font-bold mb-6 text-foreground">{children}</h1>,
                        h2: ({ children }) => (
                          <h2 className="text-2xl font-semibold mb-4 mt-8 text-foreground">{children}</h2>
                        ),
                        h3: ({ children }) => (
                          <h3 className="text-xl font-semibold mb-3 mt-6 text-foreground">{children}</h3>
                        ),
                        p: ({ children }) => <p className="text-muted-foreground mb-4 leading-relaxed">{children}</p>,
                        ul: ({ children }) => (
                          <ul className="list-disc list-inside mb-4 text-muted-foreground space-y-1">{children}</ul>
                        ),
                        ol: ({ children }) => (
                          <ol className="list-decimal list-inside mb-4 text-muted-foreground space-y-1">{children}</ol>
                        ),
                        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                        code: ({ children }) => (
                          <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>
                        ),
                      }}
                    >
                      {entry.content}
                    </ReactMarkdown>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-16 text-center">
          <div className="text-xs text-muted-foreground">⚡ Powered by Feedbax</div>
        </div>
      </div>
    </div>
  )
}

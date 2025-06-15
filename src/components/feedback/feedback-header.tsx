"use client"
import { BookOpen, ArrowLeft, BarChart3, FileText, ChevronDown, Eye, Lightbulb, Bug } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ThemeToggle } from "./theme-toggle"
import { useRouter, usePathname } from "next/navigation"

interface FeedbackHeaderProps {
  selectedBoard?: "all" | "feature" | "bug"
  onBoardChange?: (board: "all" | "feature" | "bug") => void
}

export function FeedbackHeader({ selectedBoard = "all", onBoardChange }: FeedbackHeaderProps) {
  const router = useRouter()
  const pathname = usePathname()

  const isRoadmapPage = pathname === "/roadmap"
  const isFeedbackPage = pathname === "/"
  const isChangelogPage = pathname === "/changelog"

  return (
    <header className="border-b border-border bg-card">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-2">
              <BookOpen className="h-6 w-6 text-primary" />
              <span className="text-xl font-semibold">Syllax</span>
            </div>

            <nav className="flex items-center space-x-1">
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Syllax
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={isFeedbackPage ? "bg-primary/10 text-primary" : "text-muted-foreground"}
                    onClick={() => router.push("/")}
                  >
                    <BookOpen className="h-4 w-4 mr-2" />
                    Feedback
                    {isFeedbackPage && <ChevronDown className="h-4 w-4 ml-2" />}
                  </Button>
                </DropdownMenuTrigger>
                {isFeedbackPage && (
                  <DropdownMenuContent align="start" className="w-48">
                    <DropdownMenuItem onClick={() => onBoardChange?.("all")}>
                      <Eye className="h-4 w-4 mr-2" />
                      All posts
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onBoardChange?.("feature")}>
                      <Lightbulb className="h-4 w-4 mr-2" />
                      Feature Request
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onBoardChange?.("bug")}>
                      <Bug className="h-4 w-4 mr-2" />
                      Bug Reports
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                )}
              </DropdownMenu>

              <Button
                variant="ghost"
                size="sm"
                className={isRoadmapPage ? "bg-primary/10 text-primary" : "text-muted-foreground"}
                onClick={() => router.push("/roadmap")}
              >
                <BarChart3 className="h-4 w-4 mr-2" />
                Roadmap
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={isChangelogPage ? "bg-primary/10 text-primary" : "text-muted-foreground"}
                onClick={() => router.push("/changelog")}
              >
                <FileText className="h-4 w-4 mr-2" />
                Changelog
              </Button>
            </nav>
          </div>

          <div className="flex items-center space-x-4">
            <ThemeToggle />
            <Avatar className="h-8 w-8">
              <AvatarImage src="/placeholder.svg?height=32&width=32" />
              <AvatarFallback>U</AvatarFallback>
            </Avatar>
          </div>
        </div>
      </div>
    </header>
  )
}

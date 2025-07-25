"use client";
import {
  Layers,
  ArrowLeft,
  Map,
  History,
  ChevronDown,
  Eye,
  Lightbulb,
  Bug,
  Menu,
  ZapIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ThemeToggle } from "./theme-toggle";
import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { UserMenu } from "@/components/auth";

interface FeedbackHeaderProps {
  selectedBoard?: "all" | "feature" | "bug";
  onBoardChange?: (board: "all" | "feature" | "bug") => void;
}

export function FeedbackHeader({
  onBoardChange,
}: FeedbackHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const isRoadmapPage = pathname === "/roadmap";
  const isFeedbackPage = pathname === "/";
  const isChangelogPage = pathname === "/changelog";

  function handleNavigation(path: string) {
    router.push(path);
    setIsMobileMenuOpen(false);
  }

  function handleBoardChange(board: "all" | "feature" | "bug") {
    onBoardChange?.(board);
    setIsMobileMenuOpen(false);
  }

  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border/50 shadow-sm">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-3 group">
              <div className="relative">
                <ZapIcon className="h-7 w-7 text-yellow-500 group-hover:text-yellow-400 transition-colors duration-200" />
                <div className="absolute -inset-1 bg-yellow-500/20 rounded-full blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                Feedbax
              </span>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all duration-200 rounded-lg"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to App
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={
                      isFeedbackPage
                        ? "bg-gradient-to-r from-primary/10 to-primary/5 text-primary border border-primary/20 shadow-sm hover:from-primary/15 hover:to-primary/10"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all duration-200"
                    }
                    onClick={() => router.push("/")}
                  >
                    <Layers className="h-4 w-4 mr-2" />
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
                    <DropdownMenuItem
                      onClick={() => onBoardChange?.("feature")}
                    >
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
                className={
                  isRoadmapPage
                    ? "bg-gradient-to-r from-primary/10 to-primary/5 text-primary border border-primary/20 shadow-sm hover:from-primary/15 hover:to-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all duration-200"
                }
                onClick={() => router.push("/roadmap")}
              >
                <Map className="h-4 w-4 mr-2" />
                Roadmap
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={
                  isChangelogPage
                    ? "bg-gradient-to-r from-primary/10 to-primary/5 text-primary border border-primary/20 shadow-sm hover:from-primary/15 hover:to-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all duration-200"
                }
                onClick={() => router.push("/changelog")}
              >
                <History className="h-4 w-4 mr-2" />
                Changelog
              </Button>
            </nav>
          </div>

          <div className="flex items-center space-x-3">
            <div className="hidden md:flex items-center space-x-3">
              <div className="px-3 py-1 rounded-full bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20">
                <span className="text-xs font-medium text-green-600 dark:text-green-400">
                  ✨ Beta
                </span>
              </div>
              <div className="w-px h-6 bg-border/50" />
              <ThemeToggle />
              <UserMenu />
            </div>

            {/* Mobile Menu */}
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="md:hidden rounded-lg hover:bg-accent/50 transition-all duration-200"
                >
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-80">
                <SheetHeader>
                  <SheetTitle className="flex items-center space-x-2">
                    <Layers className="h-5 w-5 text-primary" />
                    <span>Syllax Navigation</span>
                  </SheetTitle>
                </SheetHeader>

                <div className="mt-6 space-y-4">
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-muted-foreground"
                    onClick={() => handleNavigation("/")}
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Syllax
                  </Button>

                  <div className="space-y-2">
                    <Button
                      variant={isFeedbackPage ? "secondary" : "ghost"}
                      className="w-full justify-start"
                      onClick={() => handleNavigation("/")}
                    >
                      <Layers className="h-4 w-4 mr-2" />
                      Feedback
                    </Button>

                    {isFeedbackPage && (
                      <div className="ml-6 space-y-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start text-sm"
                          onClick={() => handleBoardChange("all")}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          All posts
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start text-sm"
                          onClick={() => handleBoardChange("feature")}
                        >
                          <Lightbulb className="h-4 w-4 mr-2" />
                          Feature Request
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start text-sm"
                          onClick={() => handleBoardChange("bug")}
                        >
                          <Bug className="h-4 w-4 mr-2" />
                          Bug Reports
                        </Button>
                      </div>
                    )}
                  </div>

                  <Button
                    variant={isRoadmapPage ? "secondary" : "ghost"}
                    className="w-full justify-start"
                    onClick={() => handleNavigation("/roadmap")}
                  >
                    <Map className="h-4 w-4 mr-2" />
                    Roadmap
                  </Button>

                  <Button
                    variant={isChangelogPage ? "secondary" : "ghost"}
                    className="w-full justify-start"
                    onClick={() => handleNavigation("/changelog")}
                  >
                    <History className="h-4 w-4 mr-2" />
                    Changelog
                  </Button>

                  <div className="pt-4 border-t border-border">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Theme
                      </span>
                      <ThemeToggle />
                    </div>

                    <div className="mt-4">
                      <UserMenu />
                    </div>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}

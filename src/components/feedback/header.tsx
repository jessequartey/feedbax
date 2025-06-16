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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  selectedBoard = "all",
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
    <header className="border-b border-border bg-card">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-2">
              <ZapIcon className="h-6 w-6 text-yellow-400" />
              <span className="text-xl font-semibold">Feedbax</span>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center space-x-1">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
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
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground"
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
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground"
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
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground"
                }
                onClick={() => router.push("/changelog")}
              >
                <History className="h-4 w-4 mr-2" />
                Changelog
              </Button>
            </nav>
          </div>

          <div className="flex items-center space-x-4">
            <div className="hidden md:flex items-center space-x-4">
              <ThemeToggle />
              <UserMenu />
            </div>

            {/* Mobile Menu */}
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm" className="md:hidden">
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

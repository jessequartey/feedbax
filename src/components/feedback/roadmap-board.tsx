"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FeedbackHeader } from "./header";
import { MessageCircle, Clock, User, Target, Rocket, CheckCircle, ArrowRight } from "lucide-react";
import { fetchRoadmapData } from "@/lib/actions";
import { appConfig } from "@/config";

interface RoadmapItem {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: "high" | "medium" | "low";
  status: "planned" | "in-progress" | "completed";
  progress: number;
  lastUpdated: string;
  comments: number;
  votes: number;
  tags: string[];
}

export default function RoadmapBoard() {
  const [roadmapData, setRoadmapData] = useState<RoadmapItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadRoadmapData = async () => {
      try {
        const result = await fetchRoadmapData();
        setRoadmapData(result.data || []);
      } catch (err) {
        setError("Failed to load roadmap data");
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    loadRoadmapData();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <FeedbackHeader />
        <div className="container mx-auto px-4 py-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="space-y-4">
                <div className="h-6 bg-muted rounded animate-pulse" />
                {[...Array(2)].map((_, j) => (
                  <div key={j} className="h-32 bg-muted rounded animate-pulse" />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <FeedbackHeader />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">Failed to load roadmap</h2>
            <p className="text-muted-foreground">Please try refreshing the page</p>
          </div>
        </div>
      </div>
    );
  }

  const plannedItems = roadmapData.filter((item) => item.status === "planned");
  const inProgressItems = roadmapData.filter((item) => item.status === "in-progress");
  const completedItems = roadmapData.filter((item) => item.status === "completed");

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "border-red-500 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400";
      case "medium":
        return "border-yellow-500 bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400";
      case "low":
        return "border-green-500 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400";
      default:
        return "border-gray-500 bg-gray-50 text-gray-700 dark:bg-gray-900/20 dark:text-gray-400";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "planned":
        return <Target className="h-4 w-4" />;
      case "in-progress":
        return <Rocket className="h-4 w-4" />;
      case "completed":
        return <CheckCircle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const RoadmapColumn = ({ title, items, status }: { title: string; items: RoadmapItem[]; status: string }) => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          {getStatusIcon(status)}
          {title}
        </h3>
        <Badge variant="outline" className="text-xs">
          {items.length}
        </Badge>
      </div>
      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">No items in this category yet</p>
          </div>
        ) : (
          items.map((item) => (
            <Card key={item.id} className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <h4 className="font-medium text-foreground line-clamp-2">
                    {item.title}
                  </h4>
                  <Badge
                    variant="outline"
                    className={`text-xs ${getPriorityColor(item.priority)}`}
                  >
                    {item.priority}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-3 line-clamp-3">
                  {item.description}
                </p>
                {item.status === "in-progress" && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>Progress</span>
                      <span>{item.progress}%</span>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all duration-300"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <MessageCircle className="h-3 w-3" />
                      <span>{item.comments}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      <span>{item.votes}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{item.lastUpdated}</span>
                  </div>
                </div>
                {item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {item.tags.slice(0, 2).map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                    {item.tags.length > 2 && (
                      <Badge variant="secondary" className="text-xs">
                        +{item.tags.length - 2}
                      </Badge>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <FeedbackHeader />
      <div className="container mx-auto px-4 py-6">
        {/* Welcome Section */}
        <div className="bg-gradient-to-r from-indigo-900/20 to-purple-900/20 border border-indigo-500/20 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-foreground mb-2">
            {appConfig.welcome.roadmap.title}
          </h2>
          <div className="text-sm text-muted-foreground space-y-1">
            {appConfig.welcome.roadmap.subtitle.map((line, index) => (
              <p key={index}>{line}</p>
            ))}
          </div>
        </div>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {appConfig.navigation.sections.roadmap.title}
            </h1>
            <p className="text-muted-foreground mt-1">
              {appConfig.navigation.sections.roadmap.description}
            </p>
          </div>
          <Button 
            variant="outline" 
            onClick={() => window.open(appConfig.urls.app, '_blank')}
            className="flex items-center gap-2"
          >
            <span>Back to {appConfig.name}</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Roadmap Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <RoadmapColumn
            title="Planned"
            items={plannedItems}
            status="planned"
          />
          <RoadmapColumn
            title="In Progress"
            items={inProgressItems}
            status="in-progress"
          />
          <RoadmapColumn
            title="Completed"
            items={completedItems}
            status="completed"
          />
        </div>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-border">
          <div className="text-center text-sm text-muted-foreground">
            <p>
              Have a feature request?{" "}
              <a
                href="/"
                className="text-primary hover:underline"
              >
                Submit your feedback
              </a>{" "}
              and help shape the future of {appConfig.name}.
            </p>
            <p className="mt-2">
              ⚡ Powered by{" "}
              <a
                href={appConfig.urls.github}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Feedbax
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

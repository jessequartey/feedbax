"use client"

import { useState } from "react"
import { MessageSquare, ChevronDown, ChevronUp, Tag, ExternalLink, Play } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog"
import ReactMarkdown from "react-markdown"
import type { ChangelogItem } from "./changelog-board"

interface ChangelogEntryProps {
  entry: ChangelogItem
  isExpanded: boolean
  onToggle: () => void
}

export function ChangelogEntry({ entry, isExpanded, onToggle }: ChangelogEntryProps) {
  const [selectedMedia, setSelectedMedia] = useState<string | null>(null)

  const previewContent = entry.content.split("\n").slice(0, 3).join("\n") + "..."

  return (
    <Card className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-2">
            <Avatar className="h-8 w-8">
              <AvatarImage src={entry.avatar || "/placeholder.svg"} />
              <AvatarFallback>{entry.author[0]}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-medium">{entry.author}</p>
              {entry.version && <p className="text-xs text-muted-foreground">{entry.version}</p>}
            </div>
          </div>
          <h2 className="text-xl font-semibold mb-2 leading-tight">{entry.title}</h2>
          {entry.tags && (
            <div className="flex flex-wrap gap-1 mb-3">
              {entry.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  <Tag className="h-3 w-3 mr-1" />
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <ReactMarkdown>{isExpanded ? entry.content : previewContent}</ReactMarkdown>
      </div>

      {/* Media */}
      {(entry.images || entry.videos) && (
        <div className="space-y-3">
          {entry.images && entry.images.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {entry.images.map((image, index) => (
                <Dialog key={index}>
                  <DialogTrigger asChild>
                    <div className="relative cursor-pointer group">
                      <img
                        src={image || "/placeholder.svg"}
                        alt={`Screenshot ${index + 1}`}
                        className="w-full h-48 object-cover rounded-lg border border-border group-hover:opacity-90 transition-opacity"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded-lg flex items-center justify-center">
                        <ExternalLink className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  </DialogTrigger>
                  <DialogContent className="max-w-4xl">
                    <img
                      src={image || "/placeholder.svg"}
                      alt={`Screenshot ${index + 1}`}
                      className="w-full h-auto rounded-lg"
                    />
                  </DialogContent>
                </Dialog>
              ))}
            </div>
          )}

          {entry.videos && entry.videos.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {entry.videos.map((video, index) => (
                <div key={index} className="relative cursor-pointer group">
                  <div className="w-full h-48 bg-muted rounded-lg border border-border flex items-center justify-center group-hover:bg-muted/80 transition-colors">
                    <Play className="h-12 w-12 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="bg-black/50 text-white px-3 py-1 rounded text-sm">Video Demo</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-border">
        <Button variant="ghost" size="sm" onClick={onToggle} className="flex items-center space-x-2">
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          <span>{isExpanded ? "Show Less" : "Read More"}</span>
        </Button>

        <Button variant="ghost" size="sm" onClick={onToggle} className="flex items-center space-x-2">
          <MessageSquare className="h-4 w-4" />
          <span>{entry.comments} Comments</span>
        </Button>
      </div>
    </Card>
  )
}

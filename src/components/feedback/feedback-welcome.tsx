export function FeedbackWelcome() {
  return (
    <div className="relative overflow-hidden bg-gradient-to-r from-primary/5 via-primary/10 to-secondary/5 border border-primary/20 rounded-2xl p-8 mb-8 backdrop-blur-sm">
      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent" />
      <div className="relative">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-full bg-primary/10 border border-primary/20">
            <span className="text-2xl">🚀</span>
          </div>
          <h2 className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            Help us improve Feedbax
          </h2>
        </div>
        <p className="text-muted-foreground mb-4 text-base">
          A modern feedback platform powered by Notion. Share your ideas, report bugs, and help shape the future!
        </p>
        <div className="grid gap-3 text-sm text-muted-foreground">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-semibold text-primary">
              1
            </div>
            <p>Search before posting! Your feedback might already exist.</p>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-semibold text-primary">
              2
            </div>
            <p>Create separate requests for multiple features.</p>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-semibold text-primary">
              3
            </div>
            <p>Select <span className="font-semibold text-foreground">&quot;Bug Report&quot;</span> when reporting bugs.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FeedbackWelcome() {
  return (
    <div className="bg-gradient-to-r from-purple-900/20 to-pink-900/20 border border-purple-500/20 rounded-lg p-6 mb-6">
      <h2 className="text-lg font-semibold text-foreground mb-2">
        Help us improve Syllax - your AI-powered learning platform! 📚
      </h2>
      <div className="text-sm text-muted-foreground space-y-1">
        <p>A few quick asks on our part:</p>
        <p>1. Search before posting! Your feedback has likely been submitted already</p>
        <p>2. If you have multiple features to request, please create separate requests for each.</p>
        <p>3. If submitting a bug, PLEASE SELECT "BUG REPORT" WHEN REPORTING</p>
      </div>
    </div>
  )
}

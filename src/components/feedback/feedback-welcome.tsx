import { appConfig } from "@/config";

export function FeedbackWelcome() {
  return (
    <div className="relative overflow-hidden bg-gradient-to-r from-primary/5 via-primary/10 to-secondary/5 border border-primary/20 rounded-2xl p-8 mb-8 backdrop-blur-sm">
      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent" />
      <div className="relative">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-full bg-primary/10 border border-primary/20">
            <span className="text-2xl">{appConfig.branding.logo}</span>
          </div>
          <h2 className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            {appConfig.welcome.feedback.title}
          </h2>
        </div>
        <p className="text-muted-foreground mb-4 text-base">
          {appConfig.welcome.feedback.subtitle}
        </p>
        <div className="grid gap-3 text-sm text-muted-foreground">
          {appConfig.welcome.feedback.guidelines.map((guideline, index) => (
            <div key={index} className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-semibold text-primary">
                {index + 1}
              </div>
              <p dangerouslySetInnerHTML={{ __html: guideline }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

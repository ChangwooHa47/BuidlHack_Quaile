const STEPS = [
  "Subscription",
  "Review",
  "Contribution",
  "Settlement",
  "Refund",
  "Claim",
  "End",
] as const;

interface StepDate {
  line1: string;
  line2?: string;
}

interface StatusStepperProps {
  currentStep: number;
  dates?: Record<number, StepDate>;
}

export default function StatusStepper({ currentStep, dates }: StatusStepperProps) {
  return (
    <div className="w-full">
      {/* Title */}
      <h2 className="mb-lg text-2xl font-medium text-gray-1000">Status</h2>

      {/* Stepper */}
      <div className="relative flex items-start">
        {/* Background connector line */}
        <div className="absolute left-4 right-4 top-4 h-0.5 rounded-full bg-alpha-20" />

        {/* Active connector line */}
        {currentStep > 0 && (
          <div
            className="absolute left-4 top-4 h-0.5 rounded-full bg-neon-glow"
            style={{
              width: `${((currentStep) / (STEPS.length - 1)) * 100}%`,
              maxWidth: "calc(100% - 32px)",
            }}
          />
        )}

        {/* Steps */}
        {STEPS.map((step, i) => {
          const isCompleted = i < currentStep;
          const isCurrent = i === currentStep;
          const isUpcoming = i > currentStep;

          return (
            <div key={step} className="relative z-10 flex flex-1 flex-col items-center">
              {/* Circle */}
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full ${
                  isCompleted
                    ? "bg-neon-glow"
                    : isCurrent
                      ? "border-2 border-neon-glow bg-background"
                      : "bg-[#1a1a1a]"
                }`}
              >
                {isCompleted && (
                  <span className="text-sm font-medium text-gray-0">✓</span>
                )}
                {isCurrent && (
                  <div className="h-2.5 w-2.5 rounded-full bg-neon-glow" />
                )}
              </div>

              {/* Label */}
              <span
                className={`mt-xs text-sm font-medium ${
                  isUpcoming ? "text-alpha-40" : "text-gray-1000"
                }`}
              >
                {step}
              </span>

              {/* Date */}
              {dates?.[i] ? (
                <div className="mt-0.5 text-center">
                  <span className="text-[11px] text-alpha-40">{dates[i].line1}</span>
                  {dates[i].line2 && (
                    <span className="block text-[11px] text-alpha-40">{dates[i].line2}</span>
                  )}
                </div>
              ) : (
                <span className="mt-0.5 text-[11px] text-alpha-40">—</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const STEPS = [
  "Subscription",
  "Review",
  "Contribution",
  "Settlement",
  "Refund",
  "Claim",
  "End",
] as const;

interface StatusStepperProps {
  currentStep: number;
  dates?: Record<number, { label: string; sub?: string }>;
}

export default function StatusStepper({ currentStep, dates }: StatusStepperProps) {
  return (
    <div className="w-full">
      <div className="flex items-center">
        {STEPS.map((step, i) => {
          const isCompleted = i < currentStep;
          const isCurrent = i === currentStep;
          return (
            <div key={step} className="flex flex-1 flex-col items-center">
              <div className="flex w-full items-center">
                {i > 0 && (
                  <div
                    className={`h-0.5 flex-1 ${
                      isCompleted ? "bg-neon-glow" : "bg-gray-400"
                    }`}
                  />
                )}
                <div
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                    isCompleted
                      ? "border-neon-glow bg-neon-glow"
                      : isCurrent
                        ? "border-neon-glow bg-background"
                        : "border-gray-500 bg-background"
                  }`}
                >
                  {isCompleted && (
                    <svg className="h-3 w-3 text-gray-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {isCurrent && (
                    <div className="h-2 w-2 rounded-full bg-neon-glow" />
                  )}
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={`h-0.5 flex-1 ${
                      isCompleted ? "bg-neon-glow" : "bg-gray-400"
                    }`}
                  />
                )}
              </div>
              <span
                className={`mt-xs text-xs ${
                  isCompleted || isCurrent ? "text-gray-900" : "text-gray-600"
                }`}
              >
                {step}
              </span>
              {dates?.[i] && (
                <div className="mt-0.5 text-center">
                  <span className="text-[10px] text-gray-600">{dates[i].label}</span>
                  {dates[i].sub && (
                    <span className="block text-[10px] text-gray-600">{dates[i].sub}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

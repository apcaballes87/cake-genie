// Progress Bar component for upload and processing states
import { useState, useEffect } from 'react';

export function ProgressBar({ 
  duration = 30, 
  autoStart = true, 
  onComplete = null,
  className = "",
  label = "Processing...",
  showPercentage = true 
}) {
  const [progress, setProgress] = useState(0);
  const [isActive, setIsActive] = useState(autoStart);

  useEffect(() => {
    if (!isActive) return;

    const startTime = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const newProgress = Math.min((elapsed / (duration * 1000)) * 100, 100);
      
      setProgress(newProgress);
      
      if (newProgress >= 100) {
        clearInterval(timer);
        setIsActive(false);
        if (onComplete) onComplete();
      }
    }, 100);

    return () => clearInterval(timer);
  }, [duration, isActive, onComplete]);

  const restart = () => {
    setProgress(0);
    setIsActive(true);
  };

  const complete = () => {
    setProgress(100);
    setIsActive(false);
    if (onComplete) onComplete();
  };

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-purple-600 font-medium">{label}</span>
          {showPercentage && (
            <span className="text-sm text-purple-500">{Math.floor(progress)}%</span>
          )}
        </div>
      )}
      
      <div className="w-full bg-pink-100 rounded-full h-3 overflow-hidden shadow-inner">
        <div 
          className="h-full bg-gradient-to-r from-pink-500 to-purple-500 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        >
          <div className="h-full bg-gradient-to-r from-transparent via-white to-transparent opacity-30 animate-pulse"></div>
        </div>
      </div>
    </div>
  );
}

// Loading spinner component for instant feedback
export function LoadingSpinner({ size = "md", className = "" }) {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-6 h-6", 
    lg: "w-8 h-8",
    xl: "w-12 h-12"
  };

  return (
    <div className={`${sizeClasses[size]} ${className}`}>
      <div className="w-full h-full border-4 border-pink-200 border-t-pink-500 rounded-full animate-spin"></div>
    </div>
  );
}

// Combined progress indicator for different states
export function ProcessingIndicator({ 
  state = "idle", // idle, uploading, processing, complete, error
  progress = 0,
  message = "",
  duration = 30 
}) {
  const getStateDisplay = () => {
    switch (state) {
      case "uploading":
        return {
          icon: <LoadingSpinner size="sm" />,
          text: message || "Uploading image...",
          showProgress: false
        };
      case "processing":
        return {
          icon: <LoadingSpinner size="sm" />,
          text: message || "AI is analyzing your design...",
          showProgress: true
        };
      case "complete":
        return {
          icon: <span className="text-green-500 text-lg">✓</span>,
          text: message || "Analysis complete!",
          showProgress: false
        };
      case "error":
        return {
          icon: <span className="text-red-500 text-lg">✗</span>,
          text: message || "Something went wrong",
          showProgress: false
        };
      default:
        return null;
    }
  };

  const display = getStateDisplay();
  if (!display) return null;

  return (
    <div className="bg-white rounded-lg p-4 shadow-lg border border-pink-100">
      <div className="flex items-center gap-3 mb-3">
        {display.icon}
        <span className="text-gray-700 font-medium">{display.text}</span>
      </div>
      
      {display.showProgress && (
        <ProgressBar 
          duration={duration}
          autoStart={state === "processing"}
          showPercentage={true}
          className="mt-2"
          label=""
        />
      )}
    </div>
  );
}
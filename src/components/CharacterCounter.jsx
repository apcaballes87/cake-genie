// Character counting utilities for text inputs
import { useState, useCallback } from 'react';

export function useCharacterCount(initialValue = '', maxLength = 500) {
  const [value, setValue] = useState(initialValue);
  const [count, setCount] = useState(initialValue.length);

  const handleChange = useCallback((newValue) => {
    if (newValue.length <= maxLength) {
      setValue(newValue);
      setCount(newValue.length);
    }
  }, [maxLength]);

  const isNearLimit = count > maxLength * 0.8;
  const isAtLimit = count >= maxLength;

  return {
    value,
    count,
    maxLength,
    isNearLimit,
    isAtLimit,
    handleChange,
    setValue,
    remaining: maxLength - count
  };
}

// Character counter display component
export function CharacterCounter({ 
  count, 
  maxLength, 
  className = "",
  showRemaining = false 
}) {
  const percentage = (count / maxLength) * 100;
  const isNearLimit = percentage > 80;
  const isAtLimit = percentage >= 100;

  const getColorClass = () => {
    if (isAtLimit) return "text-red-500";
    if (isNearLimit) return "text-orange-500";
    return "text-gray-500";
  };

  return (
    <div className={`text-sm flex items-center gap-2 ${className}`}>
      <span className={getColorClass()}>
        {showRemaining ? `${maxLength - count} remaining` : `${count} / ${maxLength}`}
      </span>
      
      {/* Visual progress bar */}
      <div className="flex-1 max-w-16 h-1 bg-gray-200 rounded-full overflow-hidden">
        <div 
          className={`h-full transition-all duration-300 ${
            isAtLimit ? "bg-red-500" : 
            isNearLimit ? "bg-orange-500" : 
            "bg-green-500"
          }`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  );
}

// Enhanced textarea with built-in character counting
export function TextareaWithCounter({
  placeholder = "",
  maxLength = 500,
  rows = 4,
  value = "",
  onChange = () => {},
  className = "",
  label = "",
  hint = "",
  required = false,
  ...props
}) {
  const {
    value: text,
    count,
    handleChange,
    isNearLimit,
    isAtLimit
  } = useCharacterCount(value, maxLength);

  const handleInputChange = (e) => {
    const newValue = e.target.value;
    handleChange(newValue);
    onChange(newValue);
  };

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-purple-600 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      {hint && (
        <p className="text-sm text-gray-600 mb-2">{hint}</p>
      )}
      
      <div className="relative">
        <textarea
          value={text}
          onChange={handleInputChange}
          placeholder={placeholder}
          rows={rows}
          maxLength={maxLength}
          className={`
            w-full px-3 py-2 border rounded-lg resize-vertical font-sans
            focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
            ${isAtLimit ? "border-red-500" : isNearLimit ? "border-orange-500" : "border-gray-300"}
            ${isAtLimit ? "bg-red-50" : "bg-white"}
            transition-colors duration-200
          `}
          {...props}
        />
        
        {/* Character counter overlay */}
        <div className="flex justify-between items-center mt-1">
          <div></div>
          <CharacterCounter 
            count={count} 
            maxLength={maxLength}
            className="text-xs"
          />
        </div>
      </div>
    </div>
  );
}

// Simple input with character counting
export function InputWithCounter({
  type = "text",
  placeholder = "",
  maxLength = 100,
  value = "",
  onChange = () => {},
  className = "",
  label = "",
  required = false,
  ...props
}) {
  const {
    value: text,
    count,
    handleChange,
    isAtLimit
  } = useCharacterCount(value, maxLength);

  const handleInputChange = (e) => {
    const newValue = e.target.value;
    handleChange(newValue);
    onChange(newValue);
  };

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-purple-600 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <div className="relative">
        <input
          type={type}
          value={text}
          onChange={handleInputChange}
          placeholder={placeholder}
          maxLength={maxLength}
          className={`
            w-full px-3 py-2 border rounded-lg
            focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
            ${isAtLimit ? "border-red-500 bg-red-50" : "border-gray-300 bg-white"}
            transition-colors duration-200
          `}
          {...props}
        />
        
        <div className="flex justify-end mt-1">
          <CharacterCounter 
            count={count} 
            maxLength={maxLength}
            className="text-xs"
          />
        </div>
      </div>
    </div>
  );
}
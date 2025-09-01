import React, { forwardRef } from 'react';

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string | undefined;
  icon?: React.ReactNode; // optional icon (lucide-react icon component)
};

/**
 * FormInput
 * - Simple reusable input with label, icon slot and error message
 * - Forward ref so it works with react-hook-form's register ref
 */
const FormInput = forwardRef<HTMLInputElement, Props>(({ label, error, icon, className = '', ...rest }, ref) => {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <div className="relative">
        {icon && <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">{icon}</div>}
        <input
          ref={ref}
          {...rest}
          className={`w-full ${
            icon ? 'pl-10' : 'pl-4'
          } pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
            error ? 'border-red-500' : 'border-gray-300'
          } ${className}`}
        />
      </div>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
});

FormInput.displayName = 'FormInput';
export default FormInput;

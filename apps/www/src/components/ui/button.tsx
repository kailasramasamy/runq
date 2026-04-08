import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  primary: [
    'bg-gradient-to-r from-primary-600 to-violet-600 text-white font-semibold',
    'hover:from-primary-500 hover:to-violet-500',
    'hover:shadow-[0_0_24px_-4px_oklch(0.59_0.2_264/0.6)]',
    'active:from-primary-700 active:to-violet-700 active:scale-[0.98]',
  ].join(' '),
  secondary: [
    'bg-zinc-800 text-zinc-100 font-medium border border-zinc-700',
    'hover:bg-zinc-700 hover:border-zinc-600',
    'active:bg-zinc-800 active:scale-[0.98]',
  ].join(' '),
  ghost: [
    'bg-transparent text-zinc-300 font-medium',
    'hover:bg-zinc-800/60 hover:text-zinc-100',
    'active:bg-zinc-800 active:scale-[0.98]',
  ].join(' '),
};

const sizeClasses: Record<Size, string> = {
  sm: 'px-3.5 py-1.5 text-sm rounded-lg',
  md: 'px-5 py-2.5 text-sm rounded-xl',
  lg: 'px-7 py-3.5 text-base rounded-xl',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 cursor-pointer',
          'transition-all duration-200 ease-out',
          'disabled:opacity-50 disabled:pointer-events-none',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';

export { Button, type ButtonProps };

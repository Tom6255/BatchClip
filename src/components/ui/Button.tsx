import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const Button = ({ className, variant = 'primary', ...props }: ButtonProps) => {
  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed',
    secondary: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300',
    ghost: 'bg-transparent hover:bg-zinc-800/50 text-zinc-400 hover:text-white',
    danger: 'bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20'
  };

  return (
    <button
      className={cn(
        'px-4 py-2 rounded-lg font-medium transition-all duration-200 active:scale-95 flex items-center justify-center gap-2',
        variants[variant],
        className
      )}
      {...props}
    />
  );
};

export default Button;

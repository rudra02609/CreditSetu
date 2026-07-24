import type { FC, ButtonHTMLAttributes } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
}

export const Button: FC<ButtonProps> = ({
  label,
  children,
  onClick,
  variant = "default",
  size,
  className = "",
  disabled,
  ...rest
}) => {
  const base =
    "inline-flex items-center justify-center font-bold rounded-3xl transition-all duration-300 ease-out active:scale-95";

  const variants: Record<string, string> = {
    default:
      "bg-gradient-to-r from-lime-400 to-green-400 text-black shadow-lg hover:shadow-xl hover:scale-105",
    outline:
      "border-2 border-green-500 text-green-700 bg-transparent hover:bg-green-50",
    ghost: "bg-transparent text-gray-700 hover:bg-gray-100",
  };

  const sizes: Record<string, string> = {
    sm: "px-4 py-2 text-sm",
    md: "px-6 py-3 text-base",
    lg: "px-8 py-4 text-lg",
  };

  const sizeClass = sizes[size ?? "lg"];

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variants[variant ?? "default"]} ${sizeClass} ${disabled ? "opacity-60 cursor-not-allowed" : ""} ${className}`}
      {...rest}
    >
      {children ?? label}
    </button>
  );
};

export default Button;
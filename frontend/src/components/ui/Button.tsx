import React from "react"

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary"
  children: React.ReactNode
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", className = "", ...props }, ref) => {
    const baseClass = "btn"
    const variantClass = `btn-${variant}`
    return (
      <button ref={ref} className={`${baseClass} ${variantClass} ${className}`} {...props} />
    )
  }
)

Button.displayName = "Button"

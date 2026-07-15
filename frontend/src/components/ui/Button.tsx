import React from "react"

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary"
  children: React.ReactNode
}

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  const baseClass = "btn"
  const variantClass = `btn-${variant}`
  return (
    <button className={`${baseClass} ${variantClass} ${className}`} {...props} />
  )
}
